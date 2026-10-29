export type Vec2 = { x: number; y: number };
export type Direction = -1 | 0 | 1;
export type RunStatus = 'running' | 'won' | 'timeout' | 'caught' | 'zapped';

/** One tick of player intent. `action` is the E key (reserved for Phase 5 interactions). */
export interface InputFrame {
  dx: Direction;
  dy: Direction;
  action: boolean;
}

/** Change-only recording entry: applies from `tick` until the next entry. */
export interface RecordedInput {
  tick: number;
  dx: Direction;
  dy: Direction;
  action: boolean;
}

export interface GhostRecording {
  frames: RecordedInput[];
  /** First tick the ghost is no longer simulated; it holds its final pose. */
  endTick: number;
}

/** Grid coordinates are [x, y] = [column, row], matching the level JSON schema. */
export interface PlateLink {
  plate: [number, number];
  door: [number, number];
}

export interface GuardDef {
  /**
   * Closed patrol loop. The guard visits every tile along the outline,
   * then walks back to the first waypoint. Legs must be axis-aligned and
   * stay on plain floor.
   */
  path: [number, number][];
  /** Ticks spent standing on each tile (lower = faster; 8 matches the player). */
  speed: number;
}

export interface LaserCycle {
  onTicks: number;
  offTicks: number;
  /** Added to the tick before the cycle modulo; shifts the on/off window. */
  phase?: number;
}

/**
 * A beam is dangerous while active. It is either timer-driven (`cycle`) or
 * powered by a plate (`plate`): the beam is OFF while that plate is occupied.
 */
export interface LaserDef {
  tiles: [number, number][];
  cycle?: LaserCycle;
  plate?: [number, number];
}

export type SolutionEnd = 'run' | 'win';

/**
 * [x, y] or [x, y, waitTicks]. The optional third value makes the run stand
 * still after reaching that waypoint, which is how timed lasers/guards are
 * crossed. Waits are exact simulation ticks, so solutions stay deterministic.
 */
export type SolutionWaypoint = [number, number] | [number, number, number];

/**
 * One run of a level's stored solution. Waypoints are visited with a
 * deterministic driver ("walk until reached"), each leg axis-aligned.
 * `end: 'run'` banks the run as a ghost; `end: 'win'` must reach the exit.
 */
export interface SolutionRun {
  description: string;
  path: SolutionWaypoint[];
  holdTicks?: number;
  end: SolutionEnd;
}

export interface LevelDef {
  id: number;
  name: string;
  hint: string;
  maxRuns: number;
  tickLimit: number;
  grid: string[];
  links?: PlateLink[];
  guards?: GuardDef[];
  lasers?: LaserDef[];
  solution: SolutionRun[];
}

export interface EntityState {
  pos: Vec2;
  facing: Vec2;
  moveCooldown: number;
  hasKeycard: boolean;
  hasObjective: boolean;
}

/** Guards are hazards, not colliders: they never block movement. */
export interface GuardState {
  pos: Vec2;
  facing: Vec2;
}

export interface GameState {
  tick: number;
  /** Index 0 is the current player; 1..n are ghost replays in run order. */
  entities: EntityState[];
  /** Derived from the guards' patrol loops and the tick only. */
  guards: GuardState[];
  status: RunStatus;
}
