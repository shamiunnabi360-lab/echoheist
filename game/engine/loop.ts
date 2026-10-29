import { MAX_FRAME_DELTA_MS, TICK_MS } from '../config';

export interface LoopHooks {
  /** Runs at exactly TICK_RATE Hz, independent of the display refresh rate. */
  tick: () => void;
  /** Runs once per animation frame; `alpha` is the fraction toward the next tick. */
  render: (alpha: number) => void;
}

/**
 * Fixed-timestep loop driven by requestAnimationFrame.
 *
 * rAF only supplies elapsed wall-clock time; the simulation itself always
 * advances in whole ticks. Returning the stop function makes this safe for
 * React StrictMode's mount/unmount/mount cycle.
 */
export function startLoop(hooks: LoopHooks): () => void {
  let last = performance.now();
  let accumulator = 0;
  let rafId = 0;
  let running = true;

  // rAF stops in hidden tabs. Reset the clock on return so we do not replay
  // the throttled gap as a burst of simulation ticks.
  const onVisibilityChange = () => {
    last = performance.now();
    accumulator = 0;
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const frame = (now: number) => {
    if (!running) return;

    accumulator += Math.min(now - last, MAX_FRAME_DELTA_MS);
    last = now;

    while (accumulator >= TICK_MS) {
      hooks.tick();
      accumulator -= TICK_MS;
    }

    hooks.render(accumulator / TICK_MS);
    rafId = requestAnimationFrame(frame);
  };

  rafId = requestAnimationFrame(frame);

  return () => {
    running = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
