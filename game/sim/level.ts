import type { EntityState, LevelDef, Vec2 } from './types';

export const TILE = {
  WALL: '#',
  FLOOR: '.',
  SPAWN: 'P',
  PLATE: 'p',
  DOOR: 'd',
  KEYCARD: 'K',
  LOCKED_DOOR: 'L',
  DIAMOND: 'D',
  EXIT: 'E',
} as const;

export function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Returns the raw tile character. Out-of-bounds coordinates behave as walls so
 * the simulation never needs bounds checks in hot paths.
 */
export function tileAt(level: LevelDef, x: number, y: number): string {
  const row = level.grid[y];
  if (!row || x < 0 || x >= row.length) return TILE.WALL;
  return row[x];
}

export function isDoorTile(level: LevelDef, x: number, y: number): boolean {
  return tileAt(level, x, y) === TILE.DOOR;
}

export function findSpawn(level: LevelDef): Vec2 {
  for (let y = 0; y < level.grid.length; y += 1) {
    const x = level.grid[y].indexOf(TILE.SPAWN);
    if (x !== -1) return { x, y };
  }
  throw new Error(`Level ${level.id} has no spawn tile "${TILE.SPAWN}"`);
}

export function gridSize(level: LevelDef): { cols: number; rows: number } {
  let cols = 0;
  for (const row of level.grid) cols = Math.max(cols, row.length);
  return { cols, rows: level.grid.length };
}

/**
 * Door state for one tick, computed from positions *before* anyone moves.
 *
 * Rule: a door is open while any linked plate is occupied. A door can never
 * close on an occupant, so an occupied door tile always counts as open — this
 * is what prevents crushing/glitching (and is why puzzle plates are placed
 * away from their doors).
 */
export function computeOpenDoors(entities: EntityState[], level: LevelDef): Set<string> {
  const open = new Set<string>();

  for (const link of level.links ?? []) {
    const [plateX, plateY] = link.plate;
    if (entities.some((e) => e.pos.x === plateX && e.pos.y === plateY)) {
      open.add(keyOf(link.door[0], link.door[1]));
    }
  }

  for (const entity of entities) {
    if (isDoorTile(level, entity.pos.x, entity.pos.y)) {
      open.add(keyOf(entity.pos.x, entity.pos.y));
    }
  }

  return open;
}

/**
 * Per-entity walkability. Doors need a live plate, locked doors need a keycard
 * carried by that specific entity (ghost inventories are their own).
 */
export function isWalkableFor(
  level: LevelDef,
  openDoors: Set<string>,
  entity: EntityState,
  x: number,
  y: number,
): boolean {
  const tile = tileAt(level, x, y);
  if (tile === TILE.WALL) return false;
  if (tile === TILE.DOOR) return openDoors.has(keyOf(x, y));
  if (tile === TILE.LOCKED_DOOR) return entity.hasKeycard;
  return true;
}
