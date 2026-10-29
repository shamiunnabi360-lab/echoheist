'use client';

import { isCompleted, isLevelUnlocked, type Progress } from '@/game/progress';
import type { LevelDef } from '@/game/sim/types';

interface LevelSelectProps {
  levels: LevelDef[];
  progress: Progress;
  muted: boolean;
  onSelect: (index: number) => void;
  onBack: () => void;
  onToggleMute: () => void;
}

export default function LevelSelect({
  levels,
  progress,
  muted,
  onSelect,
  onBack,
  onToggleMute,
}: LevelSelectProps) {
  const ids = levels.map((level) => String(level.id));

  return (
    <section className="w-full max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-iron pb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-steel">Echo Heist</p>
          <h1 className="mt-1 text-xl font-bold tracking-[0.25em] text-bone">SELECT VAULT</h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleMute}
            className="border-2 border-steel px-3 py-1.5 text-[11px] uppercase tracking-widest text-steel transition hover:border-bone hover:text-bone"
          >
            Sound {muted ? 'OFF' : 'ON'}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="border-2 border-steel px-3 py-1.5 text-[11px] uppercase tracking-widest text-bone transition hover:border-bone hover:text-aqua"
          >
            Back
          </button>
        </div>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {levels.map((level, index) => {
          const id = String(level.id);
          const unlocked = isLevelUnlocked(progress, ids, index);
          const completed = isCompleted(progress, id);
          const record = progress.levels[id];

          const border = completed
            ? 'border-gold'
            : unlocked
              ? 'border-steel hover:border-aqua'
              : 'border-iron';

          return (
            <button
              key={level.id}
              type="button"
              disabled={!unlocked}
              onClick={() => onSelect(index)}
              className={`flex flex-col border-2 bg-dusk p-4 text-left transition ${border} ${
                unlocked ? 'hover:bg-iron/40' : 'cursor-not-allowed opacity-50'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                <span className="text-steel">
                  Level {String(index + 1).padStart(2, '0')}
                </span>
                <span
                  className={
                    completed ? 'text-gold' : unlocked ? 'text-aqua' : 'text-steel'
                  }
                >
                  {completed ? 'Cleared' : unlocked ? 'Open' : 'Locked'}
                </span>
              </div>

              <h2 className="mt-2 text-sm font-bold uppercase tracking-wider text-bone">
                {level.name}
              </h2>

              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-steel">
                {unlocked ? level.hint : 'Clear the previous vault to unlock.'}
              </p>

              <div className="mt-3 flex items-center justify-between border-t border-iron pt-2 font-mono text-[10px] uppercase">
                <span className="text-steel">
                  {level.maxRuns} runs &middot; {level.tickLimit} ticks
                </span>
                <span className={completed ? 'text-gold' : 'text-steel'}>
                  {completed
                    ? `Best run ${record?.bestRun ?? '?'}/${level.maxRuns}`
                    : unlocked
                      ? 'Unplayed'
                      : 'Locked'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-steel">
        Clearing a vault unlocks the next one. Progress saves on this device.
      </p>
    </section>
  );
}
