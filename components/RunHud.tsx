import type { SessionSnapshot } from '@/game/engine/session';
import type { LevelDef } from '@/game/sim/types';

interface RunHudProps {
  snapshot: SessionSnapshot;
  level: LevelDef;
  levelCount: number;
  muted: boolean;
  onPause: () => void;
  onRestart: () => void;
  onToggleMute: () => void;
}

const END_LABELS: Record<NonNullable<SessionSnapshot['lastEndReason']>, string> = {
  abandoned: 'BANKED',
  timeout: 'OUT OF TIME',
  caught: 'SPOTTED',
  laser: 'ZAPPED',
};

const BUTTON =
  'border-2 border-steel px-2.5 py-1.5 uppercase tracking-wider text-steel transition hover:border-bone hover:text-bone disabled:cursor-not-allowed disabled:border-iron disabled:text-iron';

export default function RunHud({
  snapshot,
  level,
  levelCount,
  muted,
  onPause,
  onRestart,
  onToggleMute,
}: RunHudProps) {
  const lowTime = snapshot.ticksRemaining <= 120;
  const active = snapshot.phase === 'active';

  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-[0.35em] text-aqua sm:text-2xl">
          ECHO HEIST
        </h1>
        <p className="mt-1 text-xs uppercase tracking-widest text-steel">
          Level {level.id} of {levelCount} &middot; <span className="text-bone">{level.name}</span>
        </p>
        <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-steel">
          <span className="font-bold uppercase tracking-widest text-gold">Hint:</span>{' '}
          {level.hint}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs">
        <Stat label="Run" value={`${snapshot.runNumber}/${snapshot.maxRuns}`} highlight />
        <Stat label="Ghosts" value={String(snapshot.ghostCount)} />
        <Stat label="Ticks" value={String(snapshot.ticksRemaining)} danger={lowTime} />
        {snapshot.lastEndReason && (
          <Stat
            label="Last"
            value={END_LABELS[snapshot.lastEndReason]}
            danger={snapshot.lastEndReason === 'caught' || snapshot.lastEndReason === 'laser'}
          />
        )}
        <Stat
          label="Card"
          value={snapshot.hasKeycard ? 'YES' : 'NO'}
          highlight={snapshot.hasKeycard}
        />
        <Stat
          label="Gem"
          value={snapshot.hasObjective ? 'YES' : 'NO'}
          highlight={snapshot.hasObjective}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onPause}
            disabled={!active}
            className={BUTTON}
          >
            Pause
          </button>
          <button type="button" onClick={onToggleMute} className={BUTTON}>
            Sound {muted ? 'off' : 'on'}
          </button>
          <button type="button" onClick={onRestart} className={BUTTON}>
            Restart
          </button>
        </div>
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  highlight,
  danger,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  const valueClass = danger ? 'text-blood' : highlight ? 'text-gold' : 'text-bone';
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-widest text-steel">{label}</span>
      <span className={`text-sm ${valueClass}`}>{value}</span>
    </span>
  );
}
