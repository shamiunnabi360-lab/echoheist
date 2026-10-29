import { GameSession } from '../engine/session';
import type {
  Direction,
  InputFrame,
  LevelDef,
  SolutionWaypoint,
  Vec2,
} from '../sim/types';

const ZERO_INPUT: InputFrame = { dx: 0, dy: 0, action: false };

export interface SolutionResult {
  passed: boolean;
  ticks: number;
  message: string;
}

/** Single-axis steering toward the next waypoint, one call per tick. */
function inputToward(pos: Vec2, target: SolutionWaypoint): InputFrame {
  const dx = Math.sign(target[0] - pos.x) as Direction;
  if (dx !== 0) return { dx, dy: 0, action: false };
  const dy = Math.sign(target[1] - pos.y) as Direction;
  return { dx: 0, dy, action: false };
}

/**
 * Replays a level's stored solution through the real GameSession: ghost runs
 * are banked exactly like a player pressing R, and the final run must win.
 * Waypoints may carry a third value (ticks to wait in place), which is how
 * timed lasers and guard patrols are crossed. This is the source of truth for
 * `npm run verify-levels`.
 */
export function verifySolution(level: LevelDef): SolutionResult {
  const runs = level.solution;
  if (!runs || runs.length === 0) return fail('no solution stored');
  if (runs.length > level.maxRuns) {
    return fail(`solution needs ${runs.length} runs but maxRuns is ${level.maxRuns}`);
  }

  const session = new GameSession(level);

  for (let r = 0; r < runs.length; r += 1) {
    const run = runs[r];
    const label = `run ${r + 1}/${runs.length}`;

    let snap = session.getSnapshot();
    if (snap.phase !== 'active') return fail(`${label}: session is not active (phase ${snap.phase})`);
    if (snap.runNumber !== r + 1) return fail(`${label}: expected run number ${r + 1}, got ${snap.runNumber}`);

    const path: SolutionWaypoint[] = run.path.map(
      (point) => [...point] as SolutionWaypoint,
    );
    let waitRemaining = 0;
    let driverSteps = 0;

    while (snap.phase === 'active' && snap.runNumber === r + 1) {
      if (snap.ticksUsed >= level.tickLimit) break;

      let input: InputFrame | null = null;
      if (waitRemaining > 0) {
        input = ZERO_INPUT;
        waitRemaining -= 1;
      } else if (path.length > 0) {
        const target = path[0];
        if (snap.playerPos.x === target[0] && snap.playerPos.y === target[1]) {
          path.shift();
          waitRemaining = target[2] ?? 0;
          continue;
        }
        input = inputToward(snap.playerPos, target);
      } else {
        break;
      }

      driverSteps += 1;
      if (driverSteps > 50000) return fail(`${label}: solution driver hit its safety limit`);

      const before = snap;
      session.tick(input);
      snap = session.getSnapshot();

      if (snap.phase === 'active' && snap.runNumber !== r + 1) {
        return fail(
          `${label}: run ended early (${snap.lastEndReason ?? 'unknown'}) at ` +
            `${before.playerPos.x},${before.playerPos.y} on tick ${before.ticksUsed + 1}`,
        );
      }
    }

    snap = session.getSnapshot();

    if (snap.phase === 'won') {
      if (r !== runs.length - 1) return fail(`${label}: won before the final solution run`);
      if (run.end !== 'win') return fail(`${label}: won but solution marks it "${run.end}"`);
      if (!snap.hasObjective) return fail(`${label}: reached the exit without the diamond`);

      const last = run.path[run.path.length - 1];
      if (snap.playerPos.x !== last[0] || snap.playerPos.y !== last[1]) {
        return fail(
          `${label}: won at ${snap.playerPos.x},${snap.playerPos.y}, expected the last waypoint ${last[0]},${last[1]}`,
        );
      }
      return {
        passed: true,
        ticks: snap.ticksUsed,
        message: `won on run ${r + 1}/${runs.length} at tick ${snap.ticksUsed} with ${snap.ghostCount} ghost(s)`,
      };
    }

    if (snap.phase === 'lost') {
      return fail(`${label}: level lost (${snap.lossReason ?? 'unknown'})`);
    }
    if (snap.runNumber !== r + 1) {
      return fail(`${label}: run ended before finishing (${snap.lastEndReason ?? 'unknown'})`);
    }
    if (path.length > 0) {
      return fail(`${label}: path unfinished at ${snap.playerPos.x},${snap.playerPos.y}`);
    }
    if (run.end === 'win') {
      return fail(`${label}: expected a win but the player is at ${snap.playerPos.x},${snap.playerPos.y}`);
    }

    const hold = run.holdTicks ?? 0;
    for (let h = 0; h < hold; h += 1) {
      const s = session.getSnapshot();
      if (s.phase !== 'active' || s.runNumber !== r + 1) break;
      session.tick(ZERO_INPUT);
    }
    snap = session.getSnapshot();
    if (snap.phase !== 'active' || snap.runNumber !== r + 1) {
      return fail(`${label}: run ended during the hold phase (${snap.lastEndReason ?? snap.phase})`);
    }

    session.endRun('abandoned');
    const next = session.getSnapshot();
    if (next.phase !== 'active') return fail(`${label}: no runs left after banking the ghost`);
    if (next.ghostCount !== r + 1) {
      return fail(`${label}: expected ${r + 1} ghost(s), got ${next.ghostCount}`);
    }
  }

  return fail('solution finished without a win');
}

function fail(message: string): SolutionResult {
  return { passed: false, ticks: 0, message };
}
