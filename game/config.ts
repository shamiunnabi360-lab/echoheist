/**
 * Shared tuning constants.
 *
 * Determinism rules for everything under game/sim:
 *  - timing is expressed in integer TICKS, never milliseconds
 *  - no Math.random(), Date.now(), performance.now() or DOM access inside the sim
 */
export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;

/** One tile of movement every N ticks while a direction is held (~7.5 tiles/sec). */
export const TICKS_PER_MOVE = 8;

/** Guard line of sight reaches this many tiles ahead (walls and closed doors block it). */
export const GUARD_SIGHT_RANGE = 3;

/** Presentation only: logical pixel size of a tile before canvas scaling. */
export const TILE_SIZE = 16;

/** Clamp the render-frame delta so a slept tab cannot produce a catch-up burst. */
export const MAX_FRAME_DELTA_MS = 250;
