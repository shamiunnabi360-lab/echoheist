'use client';

import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Direction } from '@/game/sim/types';

interface TouchControlsProps {
  onMove: (dx: Direction, dy: Direction) => void;
  onAction: () => void;
}

const DIRECTIONS: { key: string; dx: Direction; dy: Direction; label: string; position: string }[] = [
  { key: 'up', dx: 0, dy: -1, label: '▲', position: 'col-start-2 row-start-1' },
  { key: 'left', dx: -1, dy: 0, label: '◀', position: 'col-start-1 row-start-2' },
  { key: 'down', dx: 0, dy: 1, label: '▼', position: 'col-start-2 row-start-3' },
  { key: 'right', dx: 1, dy: 0, label: '▶', position: 'col-start-3 row-start-2' },
];

/**
 * On-screen D-pad plus action button. Directions are held (pointer capture),
 * so the newest pressed direction wins and releasing returns to the previous
 * one, matching keyboard behavior. Purely feeds an InputFrame — no sim access.
 */
export default function TouchControls({ onMove, onAction }: TouchControlsProps) {
  const held = useRef<{ key: string; dx: Direction; dy: Direction }[]>([]);

  const press = (key: string, dx: Direction, dy: Direction) => (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    held.current = held.current.filter((entry) => entry.key !== key);
    held.current.push({ key, dx, dy });
    onMove(dx, dy);
  };

  const release = (key: string) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    held.current = held.current.filter((entry) => entry.key !== key);
    const last = held.current[held.current.length - 1];
    onMove(last?.dx ?? 0, last?.dy ?? 0);
  };

  return (
    <div
      className="flex select-none items-center justify-between gap-6"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="grid grid-cols-3 grid-rows-3 gap-1">
        {DIRECTIONS.map((direction) => (
          <button
            key={direction.key}
            type="button"
            aria-label={`Move ${direction.key}`}
            className={`${direction.position} flex h-14 w-14 touch-none items-center justify-center border-2 border-steel bg-dusk text-lg leading-none text-bone active:border-aqua active:bg-iron`}
            onPointerDown={press(direction.key, direction.dx, direction.dy)}
            onPointerUp={release(direction.key)}
            onPointerCancel={release(direction.key)}
            onLostPointerCapture={release(direction.key)}
          >
            {direction.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-label="Interact"
        className="h-20 w-20 touch-none border-4 border-gold bg-iron text-xl font-bold text-gold active:bg-gold active:text-ink"
        onPointerDown={(event) => {
          event.preventDefault();
          onAction();
        }}
      >
        E
      </button>
    </div>
  );
}
