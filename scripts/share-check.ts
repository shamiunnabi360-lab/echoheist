import { GameSession } from '../game/engine/session';
import levels from '../game/levels/registry';
import {
  decodeShareId,
  encodeShareId,
  packShare,
  unpackShare,
} from '../game/replay/codec';
import { verifyRecordings } from '../game/replay/verify';
import type {
  Direction,
  GhostRecording,
  InputFrame,
  LevelDef,
  SolutionWaypoint,
  Vec2,
} from '../game/sim/types';

const ZERO_INPUT: InputFrame = { dx: 0, dy: 0, action: false };

function inputToward(pos: Vec2, target: SolutionWaypoint): InputFrame {
  const dx = Math.sign(target[0] - pos.x) as Direction;
  if (dx !== 0) return { dx, dy: 0, action: false };
  const dy = Math.sign(target[1] - pos.y) as Direction;
  return { dx: 0, dy, action: false };
}

/** Drives a level's stored solution and returns the real per-tick recordings. */
function captureSolution(level: LevelDef): GhostRecording[] {
  const session = new GameSession(level);

  for (let r = 0; r < level.solution.length; r += 1) {
    const run = level.solution[r];
    const path: SolutionWaypoint[] = run.path.map((point) => [...point] as SolutionWaypoint);
    let waitRemaining = 0;
    let steps = 0;
    let snap = session.getSnapshot();

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

      steps += 1;
      if (steps > 50_000) throw new Error(`level ${level.id}: driver safety limit`);
      session.tick(input);
      snap = session.getSnapshot();
    }

    snap = session.getSnapshot();
    if (snap.phase === 'won') {
      const solution = session.getSolution();
      if (!solution) throw new Error(`level ${level.id}: session did not expose the solution`);
      return solution;
    }
    if (snap.phase === 'lost') throw new Error(`level ${level.id}: lost while recording`);
    if (snap.runNumber !== r + 1) continue;

    const hold = run.holdTicks ?? 0;
    for (let h = 0; h < hold; h += 1) {
      const current = session.getSnapshot();
      if (current.phase !== 'active' || current.runNumber !== r + 1) break;
      session.tick(ZERO_INPUT);
    }
    snap = session.getSnapshot();
    if (snap.phase !== 'active' || snap.runNumber !== r + 1) continue;
    session.endRun('abandoned');
  }

  throw new Error(`level ${level.id}: solution did not win`);
}

function totalTicksOf(recordings: GhostRecording[]): number {
  return recordings.reduce((total, recording) => total + recording.endTick, 0);
}

async function main(): Promise<void> {
  // `npm run check:share -- 3` prints just a share ID, handy for API testing.
  // Add `tamper` to cut one tick off the winning run (a valid bundle that must
  // be rejected by the server-side verifier).
  const requestedLevel = Number(process.argv[2]);
  if (Number.isInteger(requestedLevel) && requestedLevel > 0) {
    const level = levels.find((candidate) => candidate.id === requestedLevel);
    if (!level) throw new Error(`unknown level ${requestedLevel}`);
    const bundle = packShare(level.id, captureSolution(level));
    if (process.argv[3] === 'tamper') {
      const finalRun = bundle.runs[bundle.runs.length - 1];
      finalRun.end -= 1;
      finalRun.frames = finalRun.frames.filter(([tick]) => tick < finalRun.end);
    }
    console.log(await encodeShareId(bundle));
    return;
  }

  let longest = 0;
  let compression = 'deflate-raw';

  if (typeof CompressionStream === 'undefined') compression = 'plain (no CompressionStream)';

  for (const level of levels) {
    const recordings = captureSolution(level);
    const bundle = packShare(level.id, recordings);
    const id = await encodeShareId(bundle);
    longest = Math.max(longest, id.length);

    const decoded = await decodeShareId(id);
    if (JSON.stringify(decoded) !== JSON.stringify(bundle)) {
      throw new Error(`level ${level.id}: codec round-trip changed the bundle`);
    }

    const roundTrip = unpackShare(decoded);
    const verification = verifyRecordings(level, roundTrip);
    if (!verification.ok) {
      throw new Error(`level ${level.id}: shared replay failed verification: ${verification.reason}`);
    }

    const runsUsed = roundTrip.length;
    const totalTicks = totalTicksOf(roundTrip);
    if (verification.runsUsed !== runsUsed || verification.totalTicks !== totalTicks) {
      throw new Error(
        `level ${level.id}: verification reported ${verification.runsUsed}/${verification.totalTicks}, ` +
          `expected ${runsUsed}/${totalTicks}`,
      );
    }

    const tampered = structuredClone(bundle);
    const finalRun = tampered.runs[tampered.runs.length - 1];
    if (finalRun.end < 1) throw new Error(`level ${level.id}: winning run has no ticks`);
    finalRun.end -= 1;
    finalRun.frames = finalRun.frames.filter(([tick]) => tick < finalRun.end);

    const tamperedResult = verifyRecordings(level, unpackShare(tampered));
    if (tamperedResult.ok) {
      throw new Error(`level ${level.id}: a truncated winning run was accepted`);
    }

    const droppedFinal = verifyRecordings(level, roundTrip.slice(0, -1));
    if (droppedFinal.ok) {
      throw new Error(`level ${level.id}: a replay without its final run was accepted`);
    }

    console.log(
      `level ${String(level.id).padStart(2, '0')}  ${level.name.padEnd(18)} ` +
        `runs=${runsUsed} ticks=${totalTicks} id=${id.length} chars`,
    );
  }

  await expectReject('z$$$', 'invalid base64url');
  await expectReject('uaGVsbG8', 'non-JSON payload');

  console.log(`\nshare codec: ${compression}, longest id ${longest} chars`);
  console.log(`anti-cheat: truncated and final-run-less replays were rejected`);
  console.log(`${levels.length}/${levels.length} levels shared and re-verified`);
}

async function expectReject(id: string, label: string): Promise<void> {
  try {
    await decodeShareId(id);
  } catch {
    return;
  }
  throw new Error(`codec accepted a bad link (${label})`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
