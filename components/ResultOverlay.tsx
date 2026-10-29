import type { SessionSnapshot } from '@/game/engine/session';
import type { LevelDef } from '@/game/sim/types';

interface ResultOverlayProps {
  snapshot: SessionSnapshot;
  level: LevelDef;
  hasNext: boolean;
  onRetry: () => void;
  onNextLevel: () => void;
  onExit: () => void;
}

export default function ResultOverlay({
  snapshot,
  level,
  hasNext,
  onRetry,
  onNextLevel,
  onExit,
}: ResultOverlayProps) {
  const won = snapshot.phase === 'won';

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/85 p-4 sm:p-6">
      <div className="w-full max-w-md border-4 border-iron bg-dusk p-6 shadow-pixel">
        <p
          className={`text-[10px] font-bold uppercase tracking-[0.4em] ${
            won ? 'text-aqua' : 'text-blood'
          }`}
        >
          {won ? 'Vault cracked' : 'Heist failed'}
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-wide text-bone">
          {won ? `${level.name} cleared` : 'The vault holds'}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-steel">{describe(snapshot)}</p>

        <dl className="mt-5 grid grid-cols-3 gap-2">
          <StatBox label="Run" value={`${snapshot.runNumber}/${snapshot.maxRuns}`} />
          <StatBox label="Ticks" value={`${snapshot.ticksUsed}/${snapshot.tickLimit}`} />
          <StatBox label="Ghosts" value={String(snapshot.ghostCount)} />
        </dl>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={won ? (hasNext ? onNextLevel : onExit) : onRetry}
            className="flex-1 border-2 border-aqua bg-aqua px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-ink transition hover:border-bone hover:bg-bone"
          >
            {won ? (hasNext ? 'Next level' : 'Level select') : 'Retry level'}
          </button>
          <button
            type="button"
            onClick={won ? onRetry : onExit}
            className="flex-1 border-2 border-steel px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-bone transition hover:border-bone hover:text-aqua"
          >
            {won ? 'Replay level' : 'Level select'}
          </button>
        </div>
      </div>
    </div>
  );
}

function describe(snapshot: SessionSnapshot): string {
  if (snapshot.phase === 'won') {
    return `You reached the exit carrying the diamond on run ${snapshot.runNumber} of ${snapshot.maxRuns}.`;
  }
  if (snapshot.lossReason === 'timeout') {
    return `The clock ran out on run ${snapshot.runNumber}. All ${snapshot.maxRuns} runs are spent.`;
  }
  if (snapshot.lossReason === 'caught') {
    return `A guard spotted you on run ${snapshot.runNumber}. All ${snapshot.maxRuns} runs are spent — your last steps are still banked as a ghost.`;
  }
  if (snapshot.lossReason === 'laser') {
    return `A laser cut run ${snapshot.runNumber} short. All ${snapshot.maxRuns} runs are spent without the diamond.`;
  }
  return `Run ${snapshot.runNumber} was ended early. All ${snapshot.maxRuns} runs are spent without the diamond.`;
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-iron bg-ink px-3 py-2">
      <dt className="text-[9px] uppercase tracking-widest text-steel">{label}</dt>
      <dd className="mt-1 font-mono text-sm text-bone">{value}</dd>
    </div>
  );
}
