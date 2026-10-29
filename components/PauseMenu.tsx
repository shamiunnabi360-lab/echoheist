'use client';

interface PauseMenuProps {
  muted: boolean;
  onResume: () => void;
  onRestart: () => void;
  onToggleMute: () => void;
  onQuit: () => void;
}

export default function PauseMenu({
  muted,
  onResume,
  onRestart,
  onToggleMute,
  onQuit,
}: PauseMenuProps) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/85 p-6">
      <div className="w-full max-w-xs border-4 border-iron bg-dusk p-6 shadow-pixel">
        <p className="text-center text-[10px] uppercase tracking-[0.5em] text-steel">
          Echo Heist
        </p>
        <h2 className="mt-1 text-center text-2xl font-bold tracking-[0.3em] text-bone">
          PAUSED
        </h2>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="border-2 border-aqua bg-aqua px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-ink transition hover:border-bone hover:bg-bone"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="border-2 border-steel px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-bone transition hover:border-bone hover:text-aqua"
          >
            Restart level
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className="border-2 border-steel px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-bone transition hover:border-bone hover:text-aqua"
          >
            Sound {muted ? 'OFF' : 'ON'}
          </button>
          <button
            type="button"
            onClick={onQuit}
            className="border-2 border-blood px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-blood transition hover:bg-blood hover:text-ink"
          >
            Quit to level select
          </button>
        </div>

        <p className="mt-4 text-center text-[10px] uppercase tracking-widest text-steel">
          Esc / P to resume
        </p>
      </div>
    </div>
  );
}
