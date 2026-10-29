import type { GhostRecording, InputFrame, RecordedInput } from './types';

/**
 * Records the player's per-tick input as a change-only list.
 *
 * Determinism contract: `record()` must receive the exact InputFrame that is
 * passed to `step()` for that tick. Frames whose direction/action are unchanged
 * are skipped, so a 30-second standstill costs one entry, not 1800.
 */
export class RunRecorder {
  private frames: RecordedInput[] = [];

  record(tick: number, input: InputFrame): void {
    const last = this.frames[this.frames.length - 1];
    if (last && last.dx === input.dx && last.dy === input.dy && last.action === input.action) {
      return;
    }
    this.frames.push({ tick, dx: input.dx, dy: input.dy, action: input.action });
  }

  finish(endTick: number): GhostRecording {
    return { frames: this.frames.map((frame) => ({ ...frame })), endTick };
  }
}

/**
 * Sequential reader for a change-only recording. Feed ascending ticks; lookups
 * are O(1) amortized. Once `endTick` is reached the ghost holds still (zero
 * input) so it stays where its run ended instead of walking off forever.
 */
export class FrameCursor {
  private index = -1;
  private readonly recording: GhostRecording;

  constructor(recording: GhostRecording) {
    this.recording = recording;
  }

  at(tick: number): InputFrame {
    if (tick >= this.recording.endTick) return { dx: 0, dy: 0, action: false };

    const frames = this.recording.frames;
    while (this.index + 1 < frames.length && frames[this.index + 1].tick <= tick) {
      this.index += 1;
    }
    if (this.index < 0) return { dx: 0, dy: 0, action: false };

    const frame = frames[this.index];
    return { dx: frame.dx, dy: frame.dy, action: frame.action };
  }
}
