import {
  decodeScore,
  encodeScore,
  type LeaderboardEntry,
} from '@/game/leaderboard';

/**
 * Leaderboard + rate-limit storage.
 *
 * Uses Vercel KV / Upstash Redis through the plain REST API (no client
 * dependency). In development, when no KV env vars are present, an in-process
 * memory store keeps the endpoints usable; production refuses to run without
 * real shared storage instead of silently losing scores between invocations.
 */
export interface RateLimitInfo {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface AddScoreResult {
  rank: number | null;
  improved: boolean;
}

export class StoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreConfigError';
  }
}

interface KvConfig {
  url: string;
  token: string;
}

type StoreMode = { kind: 'kv'; config: KvConfig } | { kind: 'memory' } | { kind: 'disabled' };

const RATE_LIMIT_SCRIPT =
  "local c = redis.call('INCR', KEYS[1]); " +
  "if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; " +
  'return c';

const MEMORY_KEY = '__echoHeistDevStoreV1';

function kvConfig(): KvConfig | null {
  const url = (
    process.env.KV_REST_API_URL ??
    process.env.UPSTASH_REDIS_REST_URL ??
    ''
  ).trim();
  const token = (
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    ''
  ).trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

function storeMode(): StoreMode {
  const config = kvConfig();
  if (config) return { kind: 'kv', config };
  if (process.env.NODE_ENV !== 'production') return { kind: 'memory' };
  return { kind: 'disabled' };
}

export async function bumpRateLimit(
  scope: string,
  ipHash: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitInfo> {
  const now = Date.now();
  const key = `eh:v1:rl:${scope}:${ipHash}`;
  const mode = storeMode();

  let count = 0;
  let resetAt = now + windowSeconds * 1000;

  if (mode.kind === 'memory') {
    const counters = memory().counters;
    const current = counters.get(key);
    if (!current || current.resetAt <= now) {
      counters.set(key, { count: 1, resetAt });
      count = 1;
    } else {
      current.count += 1;
      count = current.count;
      resetAt = current.resetAt;
    }
  } else if (mode.kind === 'kv') {
    const result = await kvCommand(mode.config, [
      'EVAL',
      RATE_LIMIT_SCRIPT,
      1,
      key,
      windowSeconds,
    ]);
    count = typeof result === 'number' ? result : Number(result);
    if (!Number.isInteger(count) || count < 1) {
      throw new Error('KV rate-limit script returned an invalid count.');
    }
  } else {
    throw new StoreConfigError(
      'Leaderboard storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
    );
  }

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

export async function addScore(
  levelId: number,
  playerName: string,
  runsUsed: number,
  totalTicks: number,
): Promise<AddScoreResult> {
  const key = `eh:v1:lb:${levelId}`;
  const score = encodeScore(runsUsed, totalTicks);
  const mode = storeMode();

  if (mode.kind === 'memory') {
    const zsets = memory().zsets;
    let set = zsets.get(key);
    if (!set) {
      set = new Map();
      zsets.set(key, set);
    }

    const previous = set.get(playerName);
    const improved = previous === undefined || score < previous;
    if (improved) set.set(playerName, score);

    const ranked = [...set.entries()].sort(
      (a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
    );
    if (ranked.length > 100) {
      for (const [name] of ranked.slice(100)) set.delete(name);
    }

    const index = ranked.findIndex(([name]) => name === playerName);
    return { improved, rank: index >= 0 && index < 100 ? index + 1 : null };
  }

  if (mode.kind === 'kv') {
    const results = await kvPipeline(mode.config, [
      ['ZADD', key, 'LT', 'CH', score, playerName],
      ['ZREMRANGEBYRANK', key, 100, -1],
      ['ZRANK', key, playerName],
    ]);
    const improved = Number(results[0] ?? 0) > 0;
    const rankRaw = results[2];
    const rank =
      typeof rankRaw === 'number' && Number.isInteger(rankRaw) ? rankRaw + 1 : null;
    return { improved, rank };
  }

  throw new StoreConfigError(
    'Leaderboard storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
  );
}

export async function topScores(levelId: number, count = 20): Promise<LeaderboardEntry[]> {
  const key = `eh:v1:lb:${levelId}`;
  const take = Math.min(100, Math.max(1, Math.trunc(count)));
  const mode = storeMode();

  if (mode.kind === 'memory') {
    const set = memory().zsets.get(key);
    if (!set) return [];
    const ranked = [...set.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .slice(0, take);
    return ranked.map(([playerName, score], index) => ({
      rank: index + 1,
      playerName,
      ...decodeScore(score),
    }));
  }

  if (mode.kind === 'kv') {
    const flat = await kvCommand(mode.config, ['ZRANGE', key, 0, take - 1, 'WITHSCORES']);
    if (!Array.isArray(flat)) throw new Error('KV leaderboard query returned an invalid result.');
    return entriesFromFlat(flat);
  }

  throw new StoreConfigError(
    'Leaderboard storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
  );
}

function entriesFromFlat(flat: unknown[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const member = flat[i];
    const score = Number(flat[i + 1]);
    if (typeof member !== 'string' || !Number.isFinite(score)) continue;
    entries.push({
      rank: entries.length + 1,
      playerName: member,
      ...decodeScore(score),
    });
  }
  return entries;
}

interface MemoryStore {
  zsets: Map<string, Map<string, number>>;
  counters: Map<string, { count: number; resetAt: number }>;
}

function memory(): MemoryStore {
  const holder = globalThis as unknown as Record<string, unknown>;
  const existing = holder[MEMORY_KEY];
  if (existing && typeof existing === 'object') return existing as MemoryStore;
  const store: MemoryStore = { zsets: new Map(), counters: new Map() };
  holder[MEMORY_KEY] = store;
  return store;
}

async function kvCommand(config: KvConfig, args: (string | number)[]): Promise<unknown> {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`KV request failed with HTTP ${response.status}.`);
  if (isRecord(payload) && typeof payload.error === 'string') {
    throw new Error(`KV error: ${payload.error}`);
  }
  return isRecord(payload) ? payload.result : null;
}

async function kvPipeline(
  config: KvConfig,
  commands: (string | number)[][],
): Promise<unknown[]> {
  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`KV pipeline failed with HTTP ${response.status}.`);
  if (!Array.isArray(payload)) throw new Error('KV pipeline returned an invalid response.');

  return payload.map((item) => {
    if (isRecord(item)) {
      if (typeof item.error === 'string') throw new Error(`KV error: ${item.error}`);
      return item.result ?? null;
    }
    return null;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
