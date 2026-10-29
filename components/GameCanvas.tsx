'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '@/game/audio';
import { GameSession, type SessionSnapshot } from '@/game/engine/session';
import { startLoop } from '@/game/engine/loop';
import { KeyboardInput } from '@/game/input/inputHandler';
import { Renderer } from '@/game/renderer/renderer';
import { computeOpenDoors } from '@/game/sim/level';
import { verifyReplayDeterminism, type ReplaySelfTestResult } from '@/game/sim/replaySelfTest';
import type { Direction, EntityState, GhostRecording, LevelDef } from '@/game/sim/types';
import PauseMenu from './PauseMenu';
import ResultOverlay from './ResultOverlay';
import RunHud from './RunHud';
import SharePanel from './SharePanel';
import TouchControls from './TouchControls';

interface GameCanvasProps {
  level: LevelDef;
  levelCount: number;
  hasNext: boolean;
  muted: boolean;
  onWin: (runNumber: number) => void;
  onNextLevel: () => void;
  onExit: () => void;
  onToggleMute: () => void;
}

const KBD = 'border border-steel bg-dusk px-1 py-0.5 font-mono text-bone';

function plateTiles(level: LevelDef): [number, number][] {
  const tiles: [number, number][] = [];
  for (const link of level.links ?? []) tiles.push(link.plate);
  for (const laser of level.lasers ?? []) {
    if (laser.plate) tiles.push(laser.plate);
  }
  return tiles;
}

function plateSignature(tiles: [number, number][], entities: EntityState[]): string {
  return tiles
    .map(([x, y]) => (entities.some((e) => e.pos.x === x && e.pos.y === y) ? '1' : '0'))
    .join('');
}

function openedNewDoor(before: Set<string>, after: Set<string>): boolean {
  for (const key of after) {
    if (!before.has(key)) return true;
  }
  return false;
}

export default function GameCanvas({
  level,
  levelCount,
  hasNext,
  muted,
  onWin,
  onNextLevel,
  onExit,
  onToggleMute,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const pausedRef = useRef(false);
  const touchRef = useRef<{ dx: Direction; dy: Direction; actionQueued: boolean }>({
    dx: 0,
    dy: 0,
    actionQueued: false,
  });
  const winReportedRef = useRef(false);
  const onWinRef = useRef(onWin);

  const [snap, setSnap] = useState<SessionSnapshot | null>(null);
  const [selfTest, setSelfTest] = useState<ReplaySelfTestResult | null>(null);
  const [paused, setPaused] = useState(false);
  const [winSolution, setWinSolution] = useState<GhostRecording[] | null>(null);

  useEffect(() => {
    onWinRef.current = onWin;
  }, [onWin]);

  // Browsers only start audio inside a user gesture.
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused || snap?.phase !== 'active') {
      touchRef.current = { dx: 0, dy: 0, actionQueued: false };
    }
  }, [paused, snap?.phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const session = new GameSession(level);
    sessionRef.current = session;
    const input = new KeyboardInput();
    const renderer = new Renderer(canvas);
    const plates = plateTiles(level);

    winReportedRef.current = false;
    touchRef.current = { dx: 0, dy: 0, actionQueued: false };
    setWinSolution(null);
    setSnap(session.getSnapshot());

    const selfTestResult = verifyReplayDeterminism(level);
    setSelfTest(selfTestResult);
    if (!selfTestResult.passed) {
      console.error(`[echo-heist] replay self-test FAILED: ${selfTestResult.message}`);
    } else if (process.env.NODE_ENV !== 'production') {
      console.info(`[echo-heist] replay self-test PASS: ${selfTestResult.message}`);
    }

    const stopLoop = startLoop({
      tick: () => {
        if (pausedRef.current) {
          input.getFrame();
          input.consumeRestart();
          touchRef.current.actionQueued = false;
          return;
        }

        if (session.getSnapshot().phase !== 'active') {
          input.getFrame();
          input.consumeRestart();
          touchRef.current.actionQueued = false;
          return;
        }

        if (input.consumeRestart()) {
          session.endRun('abandoned');
          const ended = session.getSnapshot();
          setSnap(ended);
          if (ended.phase !== 'active') return;
        }

        const beforeSnap = session.getSnapshot();
        const beforeState = session.getState();

        const keyboard = input.getFrame();
        const touch = touchRef.current;
        const touchActive = touch.dx !== 0 || touch.dy !== 0;
        const action = keyboard.action || touch.actionQueued;
        touch.actionQueued = false;

        session.tick({
          dx: touchActive ? touch.dx : keyboard.dx,
          dy: touchActive ? touch.dy : keyboard.dy,
          action,
        });

        const afterSnap = session.getSnapshot();
        const afterState = session.getState();

        if (afterSnap.ghostCount > beforeSnap.ghostCount) {
          if (afterSnap.lastEndReason === 'caught') audio.play('caught');
          else if (afterSnap.lastEndReason === 'laser') audio.play('zap');
        } else if (beforeSnap.phase === 'active' && afterSnap.phase === 'won') {
          audio.play('win');
          if (!winReportedRef.current) {
            winReportedRef.current = true;
            const solution = session.getSolution();
            if (solution) setWinSolution(solution);
            onWinRef.current(afterSnap.runNumber);
          }
        } else if (afterSnap.phase === 'active' && afterSnap.ticksUsed > beforeSnap.ticksUsed) {
          const beforePlayer = beforeState.entities[0];
          const afterPlayer = afterState.entities[0];
          if (
            afterPlayer.pos.x !== beforePlayer.pos.x ||
            afterPlayer.pos.y !== beforePlayer.pos.y
          ) {
            audio.play('step');
          }

          if (
            openedNewDoor(
              computeOpenDoors(beforeState.entities, level),
              computeOpenDoors(afterState.entities, level),
            )
          ) {
            audio.play('door');
          }

          if (
            plateSignature(plates, beforeState.entities) !==
            plateSignature(plates, afterState.entities)
          ) {
            audio.play('plate');
          }
        }

        if (
          afterSnap.phase !== beforeSnap.phase ||
          afterSnap.ghostCount !== beforeSnap.ghostCount
        ) {
          setSnap(afterSnap);
        }
      },
      render: () => renderer.draw(session.getState(), session.getLevel()),
    });

    // HUD refresh is deliberately slow and outside the game loop.
    const hudInterval = window.setInterval(() => {
      if (document.hidden || pausedRef.current) return;
      const current = session.getSnapshot();
      if (current.phase === 'active') setSnap(current);
    }, 150);

    return () => {
      stopLoop();
      input.dispose();
      window.clearInterval(hudInterval);
      sessionRef.current = null;
    };
  }, [level]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key !== 'escape' && key !== 'p') return;

      const session = sessionRef.current;
      if (!session || session.getSnapshot().phase !== 'active') return;

      event.preventDefault();
      setPaused((current) => !current);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleRestart = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.restartLevel();
    winReportedRef.current = false;
    touchRef.current = { dx: 0, dy: 0, actionQueued: false };
    setWinSolution(null);
    setPaused(false);
    setSnap(session.getSnapshot());
  }, []);

  const handlePause = useCallback(() => setPaused(true), []);
  const handleResume = useCallback(() => setPaused(false), []);

  const handleQuit = useCallback(() => {
    setPaused(false);
    onExit();
  }, [onExit]);

  const handleTouchMove = useCallback((dx: Direction, dy: Direction) => {
    touchRef.current.dx = dx;
    touchRef.current.dy = dy;
  }, []);

  const handleTouchAction = useCallback(() => {
    touchRef.current.actionQueued = true;
  }, []);

  const winTotalTicks = winSolution
    ? winSolution.reduce((total, recording) => total + recording.endTick, 0)
    : 0;

  return (
    <div className="flex w-full max-w-5xl flex-col gap-3">
      {snap ? (
        <RunHud
          snapshot={snap}
          level={level}
          levelCount={levelCount}
          muted={muted}
          onPause={handlePause}
          onRestart={handleRestart}
          onToggleMute={onToggleMute}
        />
      ) : (
        <div className="h-24" />
      )}

      <div className="scanlines relative w-full overflow-hidden border-4 border-iron bg-ink shadow-pixel">
        <canvas
          ref={canvasRef}
          className="pixelated block aspect-[4/3] w-full touch-none"
          aria-label="Echo Heist game board"
        />
        {snap && snap.phase !== 'active' && (
          <ResultOverlay
            snapshot={snap}
            level={level}
            hasNext={hasNext}
            onRetry={handleRestart}
            onNextLevel={onNextLevel}
            onExit={handleQuit}
          />
        )}
        {snap && snap.phase === 'active' && paused && (
          <PauseMenu
            muted={muted}
            onResume={handleResume}
            onRestart={handleRestart}
            onToggleMute={onToggleMute}
            onQuit={handleQuit}
          />
        )}
      </div>

      {snap?.phase === 'won' && winSolution && (
        <SharePanel
          level={level}
          recordings={winSolution}
          runsUsed={winSolution.length}
          totalTicks={winTotalTicks}
        />
      )}

      {snap?.phase === 'active' && !paused && (
        <div className="md:hidden">
          <TouchControls onMove={handleTouchMove} onAction={handleTouchAction} />
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10px] uppercase tracking-wider text-steel">
        <span>
          Move <kbd className={KBD}>WASD</kbd> / <kbd className={KBD}>Arrows</kbd>
        </span>
        <span>
          <kbd className={KBD}>E</kbd> interact
        </span>
        <span>
          <kbd className={KBD}>R</kbd> bank ghost
        </span>
        <span>
          <kbd className={KBD}>Esc</kbd> pause
        </span>
        {selfTest && (
          <span className={selfTest.passed ? 'text-aqua' : 'text-blood'}>
            replay self-test {selfTest.passed ? 'PASS' : 'FAIL'} &middot; {selfTest.ticks} ticks
          </span>
        )}
      </footer>
    </div>
  );
}
