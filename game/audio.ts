export type SoundName = 'step' | 'plate' | 'door' | 'caught' | 'win' | 'zap';

const MASTER_VOLUME = 0.5;

type AudioContextCtor = typeof AudioContext;

/**
 * Tiny oscillator-based SFX engine. Presentation only — nothing here touches
 * the simulation, so muting or blocking audio can never change game state.
 */
class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** Must be called from a user gesture before browsers let audio start. */
  unlock(): void {
    if (typeof window === 'undefined') return;

    if (!this.ctx) {
      const Ctor: AudioContextCtor | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
        this.master = null;
        return;
      }
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : MASTER_VOLUME,
        this.ctx.currentTime,
        0.01,
      );
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  play(name: SoundName): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;

    switch (name) {
      case 'step':
        this.tone('square', 200, 120, now, 0.05, 0.06);
        break;
      case 'plate':
        this.tone('square', 880, 880, now, 0.05, 0.07);
        this.tone('square', 1320, 1320, now + 0.06, 0.08, 0.06);
        break;
      case 'door':
        this.tone('triangle', 180, 360, now, 0.12, 0.09);
        this.tone('square', 90, 180, now + 0.02, 0.12, 0.05);
        break;
      case 'caught':
        this.tone('sawtooth', 240, 60, now, 0.5, 0.09);
        this.tone('square', 120, 40, now + 0.05, 0.4, 0.06);
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          this.tone('square', freq, freq, now + i * 0.11, 0.13, 0.08);
        });
        break;
      case 'zap':
        this.tone('sawtooth', 1400, 200, now, 0.18, 0.07);
        break;
    }
  }

  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    start: number,
    duration: number,
    volume: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, from), start);
    if (to !== from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}

export const audio = new GameAudio();
