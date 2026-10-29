'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { normalizePlayerName, type LeaderboardEntry } from '@/game/leaderboard';
import { encodeShareId, packShare } from '@/game/replay/codec';
import type { GhostRecording, LevelDef } from '@/game/sim/types';

interface SharePanelProps {
  level: LevelDef;
  recordings: GhostRecording[];
  runsUsed: number;
  totalTicks: number;
}

interface ShareLink {
  id: string;
  url: string;
}

export default function SharePanel({
  level,
  recordings,
  runsUsed,
  totalTicks,
}: SharePanelProps) {
  const [share, setShare] = useState<ShareLink | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [scores, setScores] = useState<LeaderboardEntry[] | null>(null);
  const [boardNote, setBoardNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setShare(null);
    setShareError(null);

    encodeShareId(packShare(level.id, recordings))
      .then((id) => {
        if (cancelled) return;
        setShare({ id, url: `${window.location.origin}/replay/${id}` });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setShareError(
          error instanceof Error ? error.message : 'Could not build a share link.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [level.id, recordings]);

  const loadBoard = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/leaderboard?levelId=${level.id}`, {
        cache: 'no-store',
        signal,
      });
      const data: unknown = await response.json().catch(() => null);
      if (signal?.aborted) return;
      if (!response.ok || !isBoardPayload(data)) {
        setBoardNote('Leaderboard unavailable.');
        setScores(null);
        return;
      }
      setScores(data.scores);
      setBoardNote(data.scores.length === 0 ? 'No verified scores yet — be the first.' : null);
    } catch {
      if (signal?.aborted) return;
      setBoardNote('Leaderboard unavailable.');
      setScores(null);
    }
  }, [level.id]);

  useEffect(() => {
    const controller = new AbortController();
    void loadBoard(controller.signal);
    return () => controller.abort();
  }, [loadBoard]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const markCopied = useCallback(() => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    setCopied(true);
    copyTimerRef.current = window.setTimeout(() => {
      copyTimerRef.current = null;
      setCopied(false);
    }, 1500);
  }, []);

  const copyLink = useCallback(async () => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      markCopied();
      return;
    } catch {
      // Fall through to the legacy selection-based copy.
    }

    const input = linkRef.current;
    if (!input) return;
    input.focus();
    input.select();
    try {
      document.execCommand('copy');
      markCopied();
    } catch {
      // The link stays selectable in the field.
    }
  }, [markCopied, share]);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!share || busy) return;

      const playerName = normalizePlayerName(name);
      if (!playerName) {
        setSubmitError(
          'Name must be 1–16 characters: letters, numbers, spaces, dot, dash or underscore.',
        );
        return;
      }

      setBusy(true);
      setSubmitError(null);
      setStatus(null);

      try {
        const response = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            levelId: level.id,
            runsUsed,
            totalTicks,
            playerName,
            solution: share.id,
          }),
        });
        const data: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          setSubmitError(errorMessage(data) ?? `Submission failed (HTTP ${response.status}).`);
          return;
        }

        setStatus(scoreMessage(data));
        setName(playerName);
        await loadBoard();
      } catch {
        setSubmitError('Could not reach the leaderboard. Check your connection.');
      } finally {
        setBusy(false);
      }
    },
    [busy, level.id, loadBoard, name, runsUsed, share, totalTicks],
  );

  return (
    <section className="border-4 border-iron bg-dusk p-4 shadow-pixel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-gold">
          Share this solution
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-steel">
          {runsUsed} runs &middot; {totalTicks} ticks
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-steel">
        The link packs your recorded inputs. Anyone can watch the ghost runs replay —
        no account needed.
      </p>

      {shareError && (
        <p role="alert" className="mt-3 border-2 border-blood px-3 py-2 text-xs text-blood">
          {shareError}
        </p>
      )}

      {!share && !shareError && (
        <p className="mt-3 font-mono text-xs text-steel">Packing replay…</p>
      )}

      {share && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            ref={linkRef}
            readOnly
            value={share.url}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Share link"
            className="min-w-0 flex-1 border-2 border-iron bg-ink px-2 py-2 font-mono text-[11px] text-bone"
          />
          <button
            type="button"
            onClick={() => void copyLink()}
            className="border-2 border-gold bg-gold px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink transition hover:border-bone hover:bg-bone"
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}

      <form
        onSubmit={(event) => void submit(event)}
        className="mt-4 flex flex-col gap-2 sm:flex-row"
      >
        <label className="sr-only" htmlFor="player-name">
          Player name
        </label>
        <input
          id="player-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={16}
          placeholder="Player name"
          autoComplete="nickname"
          spellCheck={false}
          className="min-w-0 flex-1 border-2 border-iron bg-ink px-2 py-2 font-mono text-xs text-bone placeholder:text-steel focus:border-aqua focus:outline-none"
        />
        <button
          type="submit"
          disabled={!share || busy}
          className="border-2 border-aqua bg-aqua px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink transition hover:border-bone hover:bg-bone disabled:cursor-not-allowed disabled:border-steel disabled:bg-iron disabled:text-steel"
        >
          {busy ? 'Verifying…' : 'Post score'}
        </button>
      </form>

      {submitError && (
        <p role="alert" className="mt-2 border-2 border-blood px-2 py-1.5 text-xs text-blood">
          {submitError}
        </p>
      )}
      {status && (
        <p role="status" className="mt-2 border-2 border-aqua px-2 py-1.5 text-xs text-aqua">
          {status}
        </p>
      )}

      <div className="mt-4">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-steel">
          Top runs — level {level.id}
        </h3>
        {scores === null ? (
          <p className="mt-2 font-mono text-[11px] text-steel">
            {boardNote ?? 'Loading…'}
          </p>
        ) : scores.length === 0 ? (
          <p className="mt-2 font-mono text-[11px] text-steel">
            {boardNote ?? 'No verified scores yet — be the first.'}
          </p>
        ) : (
          <ol className="mt-2 space-y-1">
            {scores.slice(0, 5).map((entry) => (
              <li
                key={`${entry.rank}-${entry.playerName}`}
                className="flex items-center gap-2 border-b border-iron/60 pb-1 font-mono text-[11px]"
              >
                <span className="w-6 shrink-0 text-gold">#{entry.rank}</span>
                <span className="min-w-0 flex-1 truncate text-bone">{entry.playerName}</span>
                <span className="shrink-0 text-steel">
                  {entry.runsUsed} run{entry.runsUsed === 1 ? '' : 's'} &middot;{' '}
                  {entry.totalTicks} ticks
                </span>
              </li>
            ))}
          </ol>
        )}
        {boardNote && scores !== null && scores.length > 0 && (
          <p className="mt-1 text-[10px] text-steel">{boardNote}</p>
        )}
      </div>
    </section>
  );
}

function errorMessage(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === 'string' ? error : null;
}

function scoreMessage(value: unknown): string {
  if (typeof value !== 'object' || value === null) return 'Score verified and posted.';
  const data = value as { rank?: unknown; improved?: unknown };
  if (typeof data.rank !== 'number') return 'Score verified and posted.';
  return data.improved
    ? `Verified! New personal best — rank #${data.rank}.`
    : `Verified. Your best run still stands — rank #${data.rank}.`;
}

function isBoardPayload(value: unknown): value is { scores: LeaderboardEntry[] } {
  if (typeof value !== 'object' || value === null) return false;
  const scores = (value as { scores?: unknown }).scores;
  if (!Array.isArray(scores)) return false;
  return scores.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const candidate = entry as Partial<LeaderboardEntry>;
    return (
      typeof candidate.rank === 'number' &&
      typeof candidate.playerName === 'string' &&
      typeof candidate.runsUsed === 'number' &&
      typeof candidate.totalTicks === 'number'
    );
  });
}
