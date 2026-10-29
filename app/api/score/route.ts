import levels from '@/game/levels/registry';
import { normalizePlayerName, RUNS_SCALE } from '@/game/leaderboard';
import {
  decodeShareId,
  MAX_SHARE_ID_LENGTH,
  ShareCodecError,
  unpackShare,
} from '@/game/replay/codec';
import { verifyRecordings } from '@/game/replay/verify';
import {
  clientIp,
  hashClientIp,
  jsonResponse,
  rateLimitHeaders,
  readJsonObject,
  retryAfterSeconds,
} from '@/lib/server/http';
import { addScore, bumpRateLimit, StoreConfigError } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;
const IP_LIMIT = 10;
const WINDOW_SECONDS = 60;

/**
 * POST /api/score
 *
 * Extends the documented payload with `solution`: the share ID of the winning
 * run. The recorded inputs are re-simulated here with the same engine the
 * browser uses, so runsUsed/totalTicks are checked facts, not claims.
 */
export async function POST(request: Request): Promise<Response> {
  let limit;
  try {
    limit = await bumpRateLimit(
      'score',
      hashClientIp(clientIp(request)),
      IP_LIMIT,
      WINDOW_SECONDS,
    );
  } catch (error) {
    return storeFailure('rate limit', error);
  }

  const headers = rateLimitHeaders(limit);
  if (!limit.allowed) {
    const retryAfter = retryAfterSeconds(limit);
    return jsonResponse(
      { error: 'Too many score submissions. Try again shortly.', retryAfter },
      429,
      { ...headers, 'Retry-After': String(retryAfter) },
    );
  }

  const body = await readJsonObject(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse({ error: body.error }, body.status, headers);

  const value = body.value;
  const bad = (error: string) => jsonResponse({ error }, 400, headers);

  if (!isInt(value.levelId)) return bad('levelId must be an integer.');
  const level = levels.find((candidate) => candidate.id === value.levelId);
  if (!level) return bad('Unknown levelId.');

  if (!isInt(value.runsUsed) || value.runsUsed < 1 || value.runsUsed > level.maxRuns) {
    return bad(`runsUsed must be an integer from 1 to ${level.maxRuns}.`);
  }
  const maxTicks = level.maxRuns * level.tickLimit;
  if (
    !isInt(value.totalTicks) ||
    value.totalTicks < 1 ||
    value.totalTicks >= RUNS_SCALE ||
    value.totalTicks > maxTicks
  ) {
    return bad(`totalTicks must be an integer from 1 to ${maxTicks}.`);
  }
  if (typeof value.playerName !== 'string') return bad('playerName must be a string.');
  const playerName = normalizePlayerName(value.playerName);
  if (!playerName) {
    return bad('playerName must be 1-16 characters: letters, numbers, spaces, dot, dash or underscore.');
  }
  if (
    typeof value.solution !== 'string' ||
    value.solution.length < 2 ||
    value.solution.length > MAX_SHARE_ID_LENGTH
  ) {
    return bad('solution must be a share ID for the winning run.');
  }

  let recordings;
  try {
    const bundle = await decodeShareId(value.solution);
    if (bundle.level !== level.id) {
      return jsonResponse(
        { error: 'The submitted solution belongs to a different level.' },
        422,
        headers,
      );
    }
    recordings = unpackShare(bundle);
  } catch (error) {
    const detail = error instanceof ShareCodecError ? error.message : 'invalid replay data.';
    return jsonResponse({ error: `Replay rejected: ${detail}` }, 422, headers);
  }

  const verification = verifyRecordings(level, recordings);
  if (!verification.ok) {
    return jsonResponse({ error: `Replay rejected: ${verification.reason}` }, 422, headers);
  }
  if (
    verification.runsUsed !== value.runsUsed ||
    verification.totalTicks !== value.totalTicks
  ) {
    return jsonResponse(
      {
        error:
          `Score mismatch: the replay shows ${verification.runsUsed} run(s) and ` +
          `${verification.totalTicks} tick(s).`,
      },
      422,
      headers,
    );
  }

  try {
    const result = await addScore(level.id, playerName, value.runsUsed, value.totalTicks);
    return jsonResponse(
      {
        ok: true,
        rank: result.rank,
        improved: result.improved,
        levelId: level.id,
        playerName,
        runsUsed: value.runsUsed,
        totalTicks: value.totalTicks,
      },
      200,
      headers,
    );
  } catch (error) {
    return storeFailure('add score', error);
  }
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function storeFailure(scope: string, error: unknown): Response {
  console.error(`[api/score] ${scope} failed`, error);
  const message =
    error instanceof StoreConfigError
      ? 'Leaderboard storage is not configured on this deployment.'
      : 'Leaderboard storage is temporarily unavailable.';
  return jsonResponse({ error: message }, 503);
}
