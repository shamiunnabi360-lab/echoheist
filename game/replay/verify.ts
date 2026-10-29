import { GameSession } from '../engine/session';
import { FrameCursor } from '../sim/recording';
import type { GhostRecording, LevelDef } from '../sim/types';

export type VerifyResult =
  | { ok: true; runsUsed: number; totalTicks: number }
  | { ok: false; reason: string };

/**
 * Re-simulates a whole submitted solution with the exact same deterministic
 * engine the browser uses. A score is only valid if every run reproduces the
 * claimed end tick and the final run actually wins.
 *
 * `totalTicks` is the sum of each run's end tick (the winning run included),
 * which is what the player's session measures as well.
 */
export function verifyRecordings(level: LevelDef, recordings: GhostRecording[]): VerifyResult {
  if (recordings.length === 0) return fail('The replay contains no runs.');
  if (recordings.length > level.maxRuns) {
    return fail(`The replay uses ${recordings.length} runs but the level allows ${level.maxRuns}.`);
  }

  const session = new GameSession(level);
  let totalTicks = 0;

  for (let i = 0; i < recordings.length; i += 1) {
    const run = recordings[i];
    const label = `Run ${i + 1}`;

    const shapeError = checkRecordingShape(run, level.tickLimit);
    if (shapeError) return fail(`${label}: ${shapeError}`);

    const snap = session.getSnapshot();
    if (snap.phase !== 'active') return fail(`${label}: the level is already ${snap.phase}.`);
    if (snap.runNumber !== i + 1) return fail(`${label}: expected run ${i + 1}.`);

    const cursor = new FrameCursor(run);
    let state = snap;
    let autoEnded = false;

    while (
      state.phase === 'active' &&
      state.runNumber === i + 1 &&
      state.ticksUsed < run.endTick
    ) {
      const before = state.ticksUsed;
      session.tick(cursor.at(before));
      const after = session.getSnapshot();

      if (after.phase === 'won') {
        state = after;
        break;
      }
      if (after.phase === 'lost') {
        return fail(`${label}: the level was lost (${after.lossReason ?? 'unknown'}).`);
      }
      if (after.runNumber !== i + 1) {
        // The sim banked the run on its own (timeout, guard or laser).
        if (before + 1 !== run.endTick) {
          return fail(
            `${label}: the run ended at tick ${before + 1} (${after.lastEndReason ?? 'unknown'}) ` +
              `but the replay claims it ends at ${run.endTick}.`,
          );
        }
        autoEnded = true;
        state = after;
        break;
      }
      state = after;
    }

    if (state.phase === 'won') {
      if (i !== recordings.length - 1) {
        return fail(`${label}: the level was won before the final run.`);
      }
      if (state.ticksUsed !== run.endTick) {
        return fail(
          `${label}: the vault was cracked at tick ${state.ticksUsed} but the replay ends at ${run.endTick}.`,
        );
      }
      if (!state.hasObjective) return fail(`${label}: reached the exit without the diamond.`);

      totalTicks += run.endTick;
      return { ok: true, runsUsed: recordings.length, totalTicks };
    }

    if (i === recordings.length - 1) {
      return fail(`${label}: the final run did not crack the vault.`);
    }

    if (!autoEnded) {
      if (state.phase !== 'active' || state.runNumber !== i + 1) {
        return fail(`${label}: run state is inconsistent.`);
      }
      session.endRun('abandoned');
      const next = session.getSnapshot();
      if (next.phase !== 'active') return fail(`${label}: no runs left after banking the ghost.`);
      state = next;
    }

    if (state.ghostCount !== i + 1) {
      return fail(`${label}: expected ${i + 1} ghost(s), got ${state.ghostCount}.`);
    }

    totalTicks += run.endTick;
  }

  return fail('The replay finished without a win.');
}

function checkRecordingShape(run: GhostRecording, tickLimit: number): string | null {
  if (!run || !Array.isArray(run.frames)) return 'recording is malformed.';
  if (!Number.isInteger(run.endTick) || run.endTick < 0) return 'end tick is invalid.';
  if (run.endTick > tickLimit) return 'the run ends past the level tick limit.';

  let lastTick = -1;
  for (const frame of run.frames) {
    if (
      !frame ||
      !Number.isInteger(frame.tick) ||
      !Number.isInteger(frame.dx) ||
      !Number.isInteger(frame.dy) ||
      Math.abs(frame.dx) > 1 ||
      Math.abs(frame.dy) > 1 ||
      typeof frame.action !== 'boolean'
    ) {
      return 'contains a malformed input frame.';
    }
    if (frame.tick < 0 || frame.tick >= run.endTick) return 'has a frame tick outside the run.';
    if (frame.tick <= lastTick) return 'has unordered frame ticks.';
    lastTick = frame.tick;
  }
  return null;
}

function fail(reason: string): VerifyResult {
  return { ok: false, reason };
}
