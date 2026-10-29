/**
 * Leaderboard math shared by the browser and the serverless routes.
 *
 * A sorted-set score must order by runsUsed first, then totalTicks, both
 * ascending. `totalTicks` is always far below RUNS_SCALE (levels cap at
 * maxRuns * tickLimit, which is a few thousand), so one integer encodes both.
 */
export const RUNS_SCALE = 1_000_000;

export const MAX_PLAYER_NAME = 16;

/** 1-16 chars: starts alphanumeric, then letters, digits, space, dot, dash, underscore. */
export const PLAYER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,15}$/;

export function normalizePlayerName(raw: string): string | null {
  const name = raw.trim();
  return PLAYER_NAME_PATTERN.test(name) ? name : null;
}

export function encodeScore(runsUsed: number, totalTicks: number): number {
  return runsUsed * RUNS_SCALE + totalTicks;
}

export function decodeScore(score: number): { runsUsed: number; totalTicks: number } {
  const runsUsed = Math.floor(score / RUNS_SCALE);
  return { runsUsed, totalTicks: Math.round(score - runsUsed * RUNS_SCALE) };
}

export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  runsUsed: number;
  totalTicks: number;
}
