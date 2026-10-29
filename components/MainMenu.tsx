'use client';

interface MainMenuProps {
  totalLevels: number;
  clearedLevels: number;
  completedFlags: boolean[];
  continueLabel: string;
  allCleared: boolean;
  muted: boolean;
  onContinue: () => void;
  onLevelSelect: () => void;
  onToggleMute: () => void;
}

export default function MainMenu({
  totalLevels,
  clearedLevels,
  completedFlags,
  continueLabel,
  allCleared,
  muted,
  onContinue,
  onLevelSelect,
  onToggleMute,
}: MainMenuProps) {
  return (
    <section className="w-full max-w-xl border-4 border-iron bg-dusk p-6 shadow-pixel sm:p-10">
      <p className="text-[10px] uppercase tracking-[0.5em] text-steel">
        Deterministic heist puzzle
      </p>

      <h1 className="mt-3 text-3xl font-bold tracking-[0.3em] text-bone sm:text-5xl">
        ECHO <span className="text-aqua">HEIST</span>
      </h1>

      <p className="mt-4 max-w-md text-xs leading-relaxed text-steel sm:text-sm">
        Every run leaves a ghost behind. Cooperate with your past selves: hold plates,
        distract guards, and reach the diamond before the clock runs out.
      </p>

      <div className="mt-6">
        <div className="flex items-end justify-between text-[10px] uppercase tracking-widest text-steel">
          <span>Vaults cracked</span>
          <span className="font-mono text-sm text-gold">
            {clearedLevels}/{totalLevels}
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          {completedFlags.map((done, index) => (
            <span
              key={index}
              className={`h-2 flex-1 ${done ? 'bg-aqua' : 'bg-iron'}`}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={onContinue}
          className="border-2 border-gold bg-gold px-5 py-3 text-left text-ink transition hover:border-bone hover:bg-bone focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
        >
          <span className="block text-[10px] uppercase tracking-[0.3em] opacity-70">
            {allCleared ? 'All vaults cleared' : 'Continue'}
          </span>
          <span className="mt-0.5 block text-sm font-bold">{continueLabel}</span>
        </button>

        <button
          type="button"
          onClick={onLevelSelect}
          className="border-2 border-steel px-5 py-3 text-left text-sm font-bold uppercase tracking-widest text-bone transition hover:border-bone hover:text-aqua focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
        >
          Level select
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[11px] text-steel">
        <span>WASD / Arrows &middot; E &middot; R &middot; Esc</span>
        <button
          type="button"
          onClick={onToggleMute}
          className="border border-steel px-2 py-1 uppercase tracking-widest text-steel transition hover:border-bone hover:text-bone"
        >
          Sound {muted ? 'OFF' : 'ON'}
        </button>
      </div>
    </section>
  );
}
