import { GUARD_SIGHT_RANGE } from '../config';
import { TILE, keyOf, tileAt } from './level';
import type {
  EntityState,
  GuardDef,
  GuardState,
  LaserDef,
  LevelDef,
  Vec2,
} from './types';

const loopCache = new WeakMap<GuardDef, Vec2[]>();

/**
 * Every tile a guard visits, starting at path[0]. The last waypoint loops back
 * to the first, so a two-point path is a back-and-forth patrol and a larger
 * path is a closed circuit. Duplicate closing tile is dropped.
 */
export function guardLoop(def: GuardDef): Vec2[] {
  const cached = loopCache.get(def);
  if (cached) return cached;

  const path = def.path;
  const loop: Vec2[] = [{ x: path[0][0], y: path[0][1] }];

  let prevX = path[0][0];
  let prevY = path[0][1];
  for (let i = 1; i <= path.length; i += 1) {
    const [targetX, targetY] = path[i % path.length];
    let x = prevX;
    let y = prevY;
    while (x !== targetX || y !== targetY) {
      x += Math.sign(targetX - x);
      y += Math.sign(targetY - y);
      loop.push({ x, y });
    }
    prevX = targetX;
    prevY = targetY;
  }

  // The walk returns to the starting tile; the circuit wraps naturally.
  loop.pop();
  loopCache.set(def, loop);
  return loop;
}

/**
 * Pure function of (patrol, tick): the guard stands on one loop tile for
 * `speed` ticks and always faces the next tile. No stored state, no randomness,
 * so ghosts and replays see the exact same guards.
 */
export function guardStateAt(def: GuardDef, tick: number): GuardState {
  const loop = guardLoop(def);
  const index = Math.floor(tick / def.speed) % loop.length;
  const pos = loop[index];
  const next = loop[(index + 1) % loop.length];
  return {
    pos: { x: pos.x, y: pos.y },
    facing: { x: Math.sign(next.x - pos.x), y: Math.sign(next.y - pos.y) },
  };
}

/**
 * The guard's own tile plus up to GUARD_SIGHT_RANGE tiles ahead. Walls and
 * closed/locked doors stop the line of sight; open doors let it through.
 */
export function guardSightTiles(
  level: LevelDef,
  guard: GuardState,
  openDoors: Set<string>,
): Vec2[] {
  const tiles: Vec2[] = [{ x: guard.pos.x, y: guard.pos.y }];
  const { x: fx, y: fy } = guard.facing;
  if (fx === 0 && fy === 0) return tiles;

  for (let step = 1; step <= GUARD_SIGHT_RANGE; step += 1) {
    const x = guard.pos.x + fx * step;
    const y = guard.pos.y + fy * step;
    const tile = tileAt(level, x, y);
    if (tile === TILE.WALL) break;
    if (tile === TILE.LOCKED_DOOR) break;
    if (tile === TILE.DOOR && !openDoors.has(keyOf(x, y))) break;
    tiles.push({ x, y });
  }

  return tiles;
}

/** Plate-powered beams are off while their plate is occupied; timers use the tick. */
export function laserIsActive(laser: LaserDef, entities: EntityState[], tick: number): boolean {
  if (laser.plate) {
    const [px, py] = laser.plate;
    return !entities.some((entity) => entity.pos.x === px && entity.pos.y === py);
  }
  if (!laser.cycle) return false;

  const period = laser.cycle.onTicks + laser.cycle.offTicks;
  const phase = laser.cycle.phase ?? 0;
  return (tick + phase) % period < laser.cycle.onTicks;
}

/** Tile keys covered by all beams that are active on this tick. */
export function activeLaserTiles(
  level: LevelDef,
  entities: EntityState[],
  tick: number,
): Set<string> {
  const active = new Set<string>();
  for (const laser of level.lasers ?? []) {
    if (!laserIsActive(laser, entities, tick)) continue;
    for (const [x, y] of laser.tiles) active.add(keyOf(x, y));
  }
  return active;
}

/**
 * Guard detection rule:
 *  - the player (entities[0]) inside a sight line ends the run;
 *  - a ghost inside a sight line distracts that guard for the tick, so the
 *    guard ignores the player. Ghosts are echoes: hazards never remove them.
 */
export function playerCaught(
  entities: EntityState[],
  guards: GuardState[],
  level: LevelDef,
  openDoors: Set<string>,
): boolean {
  const player = entities[0];

  for (const guard of guards) {
    const sight = guardSightTiles(level, guard, openDoors);
    const seesPlayer = sight.some(
      (tile) => tile.x === player.pos.x && tile.y === player.pos.y,
    );
    if (!seesPlayer) continue;

    const seesGhost = entities
      .slice(1)
      .some((ghost) =>
        sight.some((tile) => tile.x === ghost.pos.x && tile.y === ghost.pos.y),
      );
    if (!seesGhost) return true;
  }

  return false;
}
