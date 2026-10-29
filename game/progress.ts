export const PROGRESS_KEY = 'echo-heist.progress.v1';

export interface LevelRecord {
  completed: boolean;
  /** 1-based run number of the fastest winning run; null until completed. */
  bestRun: number | null;
}

export interface Progress {
  version: 1;
  muted: boolean;
  levels: Record<string, LevelRecord>;
}

export function emptyProgress(): Progress {
  return { version: 1, muted: false, levels: {} };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Coerces anything that came out of storage into a valid Progress object.
 * Unknown keys, malformed records and impossible run numbers are dropped
 * rather than trusted; a corrupt save therefore degrades to an empty one.
 */
export function sanitizeProgress(raw: unknown): Progress {
  if (!isObject(raw) || raw.version !== 1) return emptyProgress();

  const levels: Record<string, LevelRecord> = {};
  if (isObject(raw.levels)) {
    for (const [id, value] of Object.entries(raw.levels)) {
      if (!isObject(value) || value.completed !== true) continue;
      const best = value.bestRun;
      levels[id] = {
        completed: true,
        bestRun:
          typeof best === 'number' && Number.isInteger(best) && best >= 1 ? best : null,
      };
    }
  }

  return { version: 1, muted: raw.muted === true, levels };
}

/** Never throws: private mode, disabled storage and bad JSON all fall back to empty. */
export function loadProgress(): Progress {
  if (typeof window === 'undefined') return emptyProgress();
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    return sanitizeProgress(JSON.parse(raw));
  } catch {
    return emptyProgress();
  }
}

/** Never throws: losing a save is annoying, crashing the menu is worse. */
export function saveProgress(progress: Progress): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    /* storage unavailable — run without persistence */
  }
}

export function isCompleted(progress: Progress, levelId: string): boolean {
  return progress.levels[levelId]?.completed === true;
}

/** A level is open if it is first, or the level before it has been cleared. */
export function isLevelUnlocked(
  progress: Progress,
  orderedIds: readonly string[],
  index: number,
): boolean {
  if (index <= 0) return true;
  const previous = orderedIds[index - 1];
  return previous !== undefined && isCompleted(progress, previous);
}

/** Index of the earliest uncleared level, or -1 when everything is done. */
export function firstUnclearedIndex(
  progress: Progress,
  orderedIds: readonly string[],
): number {
  for (let i = 0; i < orderedIds.length; i += 1) {
    if (!isCompleted(progress, orderedIds[i])) return i;
  }
  return -1;
}

export function clearedCount(progress: Progress, orderedIds: readonly string[]): number {
  return orderedIds.reduce(
    (total, id) => (isCompleted(progress, id) ? total + 1 : total),
    0,
  );
}

/** Records a win, keeping the earliest (best) winning run number. */
export function recordWin(progress: Progress, levelId: string, runNumber: number): Progress {
  const previous = progress.levels[levelId];
  const bestRun =
    previous?.bestRun == null ? runNumber : Math.min(previous.bestRun, runNumber);
  return {
    ...progress,
    levels: {
      ...progress.levels,
      [levelId]: { completed: true, bestRun },
    },
  };
}

export function withMuted(progress: Progress, muted: boolean): Progress {
  return { ...progress, muted };
}
