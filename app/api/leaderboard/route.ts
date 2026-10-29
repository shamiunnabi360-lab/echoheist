import levels from '@/game/levels/registry';
import {
  clientIp,
  hashClientIp,
  jsonResponse,
  rateLimitHeaders,
  retryAfterSeconds,
} from '@/lib/server/http';
import { bumpRateLimit, StoreConfigError, topScores } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IP_LIMIT = 60;
const WINDOW_SECONDS = 60;
const TOP_COUNT = 20;

/** GET /api/leaderboard?levelId=3 — top 20 verified scores for one level. */
export async function GET(request: Request): Promise<Response> {
  let limit;
  try {
    limit = await bumpRateLimit(
      'leaderboard',
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
      { error: 'Too many leaderboard requests. Try again shortly.', retryAfter },
      429,
      { ...headers, 'Retry-After': String(retryAfter) },
    );
  }

  const raw = new URL(request.url).searchParams.get('levelId');
  if (!raw || !/^\d{1,4}$/.test(raw)) {
    return jsonResponse(
      { error: 'levelId query parameter is required and must be an integer.' },
      400,
      headers,
    );
  }

  const levelId = Number(raw);
  const level = levels.find((candidate) => candidate.id === levelId);
  if (!level) return jsonResponse({ error: 'Unknown levelId.' }, 404, headers);

  try {
    const scores = await topScores(level.id, TOP_COUNT);
    return jsonResponse(
      { levelId: level.id, levelName: level.name, scores },
      200,
      headers,
    );
  } catch (error) {
    return storeFailure('leaderboard query', error);
  }
}

function storeFailure(scope: string, error: unknown): Response {
  console.error(`[api/leaderboard] ${scope} failed`, error);
  const message =
    error instanceof StoreConfigError
      ? 'Leaderboard storage is not configured on this deployment.'
      : 'Leaderboard storage is temporarily unavailable.';
  return jsonResponse({ error: message }, 503);
}
