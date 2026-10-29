import type { Direction, InputFrame } from '../sim/types';

const ZERO = { x: 0, y: 0 } as const;

const DIRECTION_KEYS: Record<string, { x: Direction; y: Direction }> = {
  arrowup: { x: 0, y: -1 },
  w: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
  arrowleft: { x: -1, y: 0 },
  a: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  d: { x: 1, y: 0 },
};

/**
 * Translates held keyboard state into one InputFrame per simulation tick.
 * The most recently pressed direction wins when several are held. R and E are
 * edge-triggered (consumed once per press).
 */
export class KeyboardInput {
  private order: string[] = [];
  private actionQueued = false;
  private restartQueued = false;
  private readonly target: Window;

  constructor(target: Window = window) {
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  /** Snapshot for one tick. Side effect: consumes the queued action press. */
  getFrame(): InputFrame {
    const latestKey = this.order[this.order.length - 1];
    const dir = (latestKey && DIRECTION_KEYS[latestKey]) || ZERO;
    const frame: InputFrame = { dx: dir.x, dy: dir.y, action: this.actionQueued };
    this.actionQueued = false;
    return frame;
  }

  /** True once per R keypress; used to end the current run. */
  consumeRestart(): boolean {
    const queued = this.restartQueued;
    this.restartQueued = false;
    return queued;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const key = event.key.toLowerCase();
    if (key.startsWith('arrow')) event.preventDefault();

    if (DIRECTION_KEYS[key] !== undefined) {
      this.order = this.order.filter((k) => k !== key);
      this.order.push(key);
    } else if (key === 'e' && !event.repeat) {
      this.actionQueued = true;
    } else if (key === 'r' && !event.repeat) {
      this.restartQueued = true;
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    this.order = this.order.filter((k) => k !== key);
  };

  // Stuck keys otherwise keep the player walking after focus moves away.
  private onBlur = () => {
    this.order = [];
    this.actionQueued = false;
    this.restartQueued = false;
  };
}
