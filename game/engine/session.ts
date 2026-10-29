import { FrameCursor, RunRecorder } from '../sim/recording';
import { createInitialState, step } from '../sim/simulation';
import type { GameState, GhostRecording, InputFrame, LevelDef, Vec2 } from '../sim/types';

export type SessionPhase = 'active' | 'won' | 'lost';
export type EndReason = 'timeout' | 'abandoned' | 'caught' | 'laser';

export interface SessionSnapshot {
  phase: SessionPhase;
  runNumber: number;
  maxRuns: number;
  ghostCount: number;
  ticksUsed: number;
  ticksRemaining: number;
  tickLimit: number;
  hasKeycard: boolean;
  hasObjective: boolean;
  playerPos: Vec2;
  lossReason: EndReason | null;
  /** Why the most recently banked run ended (also set while the level is still active). */
  lastEndReason: EndReason | null;
}

/**
 * Orchestrates runs for one level: records the player, banks finished runs as
 * ghosts, and replays every ghost through the same `step()` on the next run.
 *
 * No React, no timers, no DOM — the UI loop calls tick() at the fixed rate.
 */
export class GameSession {
  private readonly level: LevelDef;
  private ghosts: GhostRecording[] = [];
  private state: GameState;
  private recorder = new RunRecorder();
  private cursors: FrameCursor[] = [];
  private phase: SessionPhase = 'active';
  private lossReason: EndReason | null = null;
  private lastEndReason: EndReason | null = null;
  private finalRun = 1;
  private solution: GhostRecording[] | null = null;

  constructor(level: LevelDef) {
    this.level = level;
    this.state = createInitialState(level, 1);
  }

  getState(): GameState {
    return this.state;
  }

  getLevel(): LevelDef {
    return this.level;
  }

  /**
   * The full winning solution (banked ghosts plus the final run), available
   * only after the level is won. This is exactly what the server re-simulates
   * to validate a submitted score and what share links encode.
   */
  getSolution(): GhostRecording[] | null {
    return this.solution;
  }

  /** One tick: player input first, then every ghost's recorded input. */
  tick(playerInput: InputFrame): void {
    if (this.phase !== 'active' || this.state.status !== 'running') return;

    const tick = this.state.tick;
    const inputs: InputFrame[] = [playerInput, ...this.cursors.map((cursor) => cursor.at(tick))];
    this.recorder.record(tick, playerInput);
    this.state = step(this.state, inputs, this.level);

    if (this.state.status === 'won') {
      this.phase = 'won';
      this.finalRun = this.ghosts.length + 1;
      this.solution = [...this.ghosts, this.recorder.finish(this.state.tick)];
      return;
    }
    if (this.state.status === 'caught') {
      this.endRun('caught');
      return;
    }
    if (this.state.status === 'zapped') {
      this.endRun('laser');
      return;
    }
    if (this.state.status === 'timeout') {
      this.endRun('timeout');
    }
  }

  /** Ends the active run, banks its recording, and starts the next run. */
  endRun(reason: EndReason): void {
    if (this.phase !== 'active') return;

    this.lastEndReason = reason;
    this.ghosts.push(this.recorder.finish(this.state.tick));
    this.finalRun = this.ghosts.length;

    if (this.ghosts.length >= this.level.maxRuns) {
      this.phase = 'lost';
      this.lossReason = reason;
      return;
    }

    this.beginRun();
  }

  /** Clears every ghost and starts over at run 1. */
  restartLevel(): void {
    this.ghosts = [];
    this.lossReason = null;
    this.lastEndReason = null;
    this.beginRun();
  }

  getSnapshot(): SessionSnapshot {
    const player = this.state.entities[0];
    return {
      phase: this.phase,
      runNumber: this.phase === 'active' ? this.ghosts.length + 1 : this.finalRun,
      maxRuns: this.level.maxRuns,
      ghostCount: this.ghosts.length,
      ticksUsed: this.state.tick,
      ticksRemaining: Math.max(0, this.level.tickLimit - this.state.tick),
      tickLimit: this.level.tickLimit,
      hasKeycard: player.hasKeycard,
      hasObjective: player.hasObjective,
      playerPos: player.pos,
      lossReason: this.lossReason,
      lastEndReason: this.lastEndReason,
    };
  }

  private beginRun(): void {
    this.state = createInitialState(this.level, 1 + this.ghosts.length);
    this.cursors = this.ghosts.map((ghost) => new FrameCursor(ghost));
    this.recorder = new RunRecorder();
    this.solution = null;
    this.phase = 'active';
  }
}
