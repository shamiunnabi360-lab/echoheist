'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { startLoop } from '@/game/engine/loop';
import { GameSession } from '@/game/engine/session';
import { Renderer } from '@/game/renderer/renderer';
import { FrameCursor } from '@/game/sim/recording';
import type { GhostRecording, LevelDef } from '@/game/sim/types';

interface ReplayPlayerProps {
  level: LevelDef;
  recordings: GhostRecording[];
  runsUsed: number;
  totalTicks: number;
}

interface ReplayHud {
  run: number;
  ghosts: number;
  elapsed: number;
  done: boolean;
  won: boolean;
}

const INITIAL_HUD: ReplayHud = {
  run: 1,
  ghosts: 0,
  elapsed: 0,
  done: false,
  won: false,
};

export default function ReplayPlayer({
  level,
  recordings,
  runsUsed,
  totalTicks,
}: ReplayPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [hud, setHud] = useState<ReplayHud>(INITIAL_HUD);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const session = new GameSession(level);
    const renderer = new Renderer(canvas);
    const cursors = recordings.map((recording) => new FrameCursor(recording));

    let runIndex = 0;
    let completedTicks = 0;
    let finished = false;

    setHud(INITIAL_HUD);

    const report = (force: boolean) => {
      const snap = session.getSnapshot();
      if (!force && snap.ticksUsed % 6 !== 0) return;
      setHud({
        run: snap.runNumber,
        ghosts: snap.ghostCount,
        elapsed: Math.min(totalTicks, completedTicks + snap.ticksUsed),
        done: finished,
        won: snap.phase === 'won',
      });
    };

    const stop = startLoop({
      tick: () => {
        if (finished || pausedRef.current) return;

        const before = session.getSnapshot();
        if (before.phase !== 'active') {
          finished = true;
          report(true);
          return;
        }

        const recording = recordings[runIndex];
        if (!recording) {
          finished = true;
          report(true);
          return;
        }

        if (before.ticksUsed >= recording.endTick) {
          // A run can legitimately be banked at tick 0 (empty recording).
          // The final run must win, so anything else here is malformed data.
          if (runIndex === recordings.length - 1) {
            finished = true;
            report(true);
            return;
          }
          session.endRun('abandoned');
          completedTicks += recording.endTick;
          runIndex += 1;
          report(true);
          return;
        }

        session.tick(cursors[runIndex].at(before.ticksUsed));
        const after = session.getSnapshot();

        if (after.phase === 'won' || after.phase === 'lost') {
          finished = true;
          report(true);
          return;
        }

        if (after.runNumber !== before.runNumber) {
          // The sim banked this run itself (timeout, guard or laser).
          completedTicks += recording.endTick;
          runIndex += 1;
          report(true);
          return;
        }

        if (after.ticksUsed >= recording.endTick) {
          if (runIndex === recordings.length - 1) {
            finished = true;
            report(true);
            return;
          }
          session.endRun('abandoned');
          completedTicks += recording.endTick;
          runIndex += 1;
          report(true);
          return;
        }

        report(false);
      },
      render: () => renderer.draw(session.getState(), level),
    });

    return () => stop();
  }, [level, recordings, replayKey, totalTicks]);

  const restart = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    setReplayKey((current) => current + 1);
  }, []);

  const frameCount = recordings.reduce((total, recording) => total + recording.frames.length, 0);
  const progress = totalTicks > 0 ? Math.min(100, Math.round((hud.elapsed / totalTicks) * 100)) : 0;

  return (
    <div className="flex w-full flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-aqua">
            Shared replay
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-wide text-bone">{level.name}</h1>
          <p className="mt-1 text-xs leading-relaxed text-steel">
            Recorded inputs re-simulated through the deterministic engine.
          </p>
        </div>
        <Link
          href="/"
          className="border-2 border-steel px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-bone transition hover:border-aqua hover:text-aqua"
        >
          Play Echo Heist
        </Link>
      </header>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Runs" value={String(runsUsed)} />
        <Stat label="Ticks" value={String(totalTicks)} />
        <Stat label="Run" value={`${hud.run}/${runsUsed}`} />
        <Stat label="Ghosts" value={String(hud.ghosts)} />
      </dl>

      <div className="h-2 border-2 border-iron bg-ink" aria-hidden="true">
        <div
          className="h-full bg-aqua transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="scanlines relative w-full overflow-hidden border-4 border-iron bg-ink shadow-pixel">
        <canvas
          ref={canvasRef}
          className="pixelated block aspect-[4/3] w-full"
          aria-label={`Replay of ${level.name}`}
        />
        {hud.done && (
          <div className="absolute inset-x-0 bottom-0 border-t-4 border-iron bg-ink/90 px-4 py-3 text-center">
            <p
              className={`text-xs font-bold uppercase tracking-[0.3em] ${
                hud.won ? 'text-aqua' : 'text-blood'
              }`}
            >
              {hud.won ? 'Vault cracked — replay complete' : 'Replay ended'}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPaused((current) => !current)}
          disabled={hud.done}
          className="border-2 border-aqua bg-aqua px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink transition hover:border-bone hover:bg-bone disabled:cursor-not-allowed disabled:border-steel disabled:bg-iron disabled:text-steel"
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          onClick={restart}
          className="border-2 border-steel px-4 py-2 text-xs font-bold uppercase tracking-widest text-bone transition hover:border-aqua hover:text-aqua"
        >
          Restart
        </button>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-steel">
          {hud.elapsed}/{totalTicks} ticks &middot; {frameCount} input frames
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-iron bg-dusk px-3 py-2">
      <dt className="text-[9px] uppercase tracking-widest text-steel">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-bone">{value}</dd>
    </div>
  );
}
