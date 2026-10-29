import { TICKS_PER_MOVE } from '../config';
import { activeLaserTiles, guardStateAt, playerCaught } from './hazards';
import { TILE, computeOpenDoors, findSpawn, isWalkableFor, keyOf, tileAt } from './level';
import type { EntityState, GameState, InputFrame, LevelDef, Vec2 } from './types';

export function createEntity(spawn: Vec2): EntityState {
  return {
    pos: { ...spawn },
    facing: { x: 0, y: 1 },
    moveCooldown: 0,
    hasKeycard: false,
    hasObjective: false,
  };
}

export function createInitialState(level: LevelDef, entityCount: number): GameState {
  const spawn = findSpawn(level);
  return {
    tick: 0,
    entities: Array.from({ length: Math.max(1, entityCount) }, () => createEntity(spawn)),
    guards: (level.guards ?? []).map((def) => guardStateAt(def, 0)),
    status: 'running',
  };
}

const NO_INPUT: InputFrame = { dx: 0, dy: 0, action: false };

/**
 * Advances the simulation exactly one tick.
 *
 * PURE: depends only on (state, inputs, level). No wall clock, no randomness,
 * no DOM. `inputs[i]` drives `state.entities[i]`; the UI feeds ghost recordings
 * through this same function, which is the core of the echo mechanic.
 */
export function step(state: GameState, inputs: InputFrame[], level: LevelDef): GameState {
  if (state.status !== 'running') return state;

  // Doors are resolved from pre-move positions, so entity order inside a tick
  // can never change the outcome.
  const openDoors = computeOpenDoors(state.entities, level);

  const entities = state.entities.map((entity, i) =>
    moveEntity(entity, inputs[i] ?? NO_INPUT, level, openDoors),
  );

  const nextTick = state.tick + 1;
  const guards = (level.guards ?? []).map((def) => guardStateAt(def, nextTick));
  const player = entities[0];

  // Priority: reaching the exit safely wins even on a tick a hazard would fire.
  let status: GameState['status'] = 'running';
  if (tileAt(level, player.pos.x, player.pos.y) === TILE.EXIT && player.hasObjective) {
    status = 'won';
  } else if (playerCaught(entities, guards, level, openDoors)) {
    status = 'caught';
  } else if (activeLaserTiles(level, entities, nextTick).has(keyOf(player.pos.x, player.pos.y))) {
    status = 'zapped';
  } else if (nextTick >= level.tickLimit) {
    status = 'timeout';
  }

  return { tick: nextTick, entities, guards, status };
}

function moveEntity(
  entity: EntityState,
  input: InputFrame,
  level: LevelDef,
  openDoors: Set<string>,
): EntityState {
  const next: EntityState = {
    pos: { ...entity.pos },
    facing: { ...entity.facing },
    moveCooldown: entity.moveCooldown > 0 ? entity.moveCooldown - 1 : 0,
    hasKeycard: entity.hasKeycard,
    hasObjective: entity.hasObjective,
  };

  const wantsMove = input.dx !== 0 || input.dy !== 0;
  if (wantsMove) next.facing = { x: input.dx, y: input.dy };

  if (wantsMove && next.moveCooldown === 0) {
    const tx = next.pos.x + input.dx;
    const ty = next.pos.y + input.dy;
    if (isWalkableFor(level, openDoors, next, tx, ty)) {
      next.pos = { x: tx, y: ty };
      // -1 because the cooldown is decremented on the tick before the next move.
      next.moveCooldown = TICKS_PER_MOVE - 1;

      const tile = tileAt(level, tx, ty);
      if (tile === TILE.KEYCARD) next.hasKeycard = true;
      if (tile === TILE.DIAMOND) next.hasObjective = true;
    }
    // Blocked moves keep the cooldown at 0 so turning into open space feels instant.
  }

  return next;
}
