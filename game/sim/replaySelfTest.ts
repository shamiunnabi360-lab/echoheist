import { FrameCursor, RunRecorder } from './recording';
import { createInitialState, step } from './simulation';
import type { GameState, GhostRecording, InputFrame, LevelDef } from './types';

export interface ReplaySelfTestResult {
  passed: boolean;
  ticks: number;
  message: string;
}

/**
 * Deterministic scripted input (no randomness): 24-tick legs in a fixed
 * rotation around the compass, with an occasional action press.
 */
function scriptedInput(tick: number): InputFrame {
  const directions = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ] as const;
  const dir = directions[Math.floor(tick / 24) % directions.length];
  return { dx: dir.x, dy: dir.y, action: tick % 97 === 0 };
}

function recordScriptedRun(
  level: LevelDef,
  maxTicks: number,
): { recording: GhostRecording; finalState: GameState } {
  let state = createInitialState(level, 1);
  const recorder = new RunRecorder();

  for (let t = 0; t < maxTicks && state.status === 'running'; t += 1) {
    const input = scriptedInput(state.tick);
    recorder.record(state.tick, input);
    state = step(state, [input], level);
  }

  return { recording: recorder.finish(state.tick), finalState: state };
}

function replayRecording(level: LevelDef, recording: GhostRecording): GameState {
  let state = createInitialState(level, 1);
  const cursor = new FrameCursor(recording);

  while (state.tick < recording.endTick && state.status === 'running') {
    state = step(state, [cursor.at(state.tick)], level);
  }

  return state;
}

function signature(state: GameState): string {
  const entities = state.entities
    .map((e) => `${e.pos.x},${e.pos.y},${e.hasKeycard ? 'K' : '-'},${e.hasObjective ? 'D' : '-'}`)
    .join('|');
  const guards = state.guards
    .map((g) => `${g.pos.x},${g.pos.y}>${g.facing.x},${g.facing.y}`)
    .join('|');
  return `${entities}@${guards}@tick=${state.tick}#${state.status}`;
}

/**
 * Debug check: record a scripted run, then replay its recording twice through
 * the same `step()` and assert the final states match each other and the
 * original. Used by `npm run test:debug` and shown in the dev footer.
 */
export function verifyReplayDeterminism(level: LevelDef, maxTicks = 400): ReplaySelfTestResult {
  const { recording, finalState } = recordScriptedRun(level, maxTicks);

  const original = signature(finalState);
  const firstReplay = signature(replayRecording(level, recording));
  const secondReplay = signature(replayRecording(level, recording));

  if (firstReplay !== secondReplay) {
    return {
      passed: false,
      ticks: finalState.tick,
      message: `replays differ: ${firstReplay} vs ${secondReplay}`,
    };
  }
  if (firstReplay !== original) {
    return {
      passed: false,
      ticks: finalState.tick,
      message: `replay differs from original: ${firstReplay} vs ${original}`,
    };
  }
  return {
    passed: true,
    ticks: finalState.tick,
    message: `final state ${firstReplay} reproduced twice`,
  };
}
