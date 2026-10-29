import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import ReplayPlayer from '@/components/ReplayPlayer';
import levels from '@/game/levels/registry';
import { decodeShareId, ShareCodecError, unpackShare } from '@/game/replay/codec';
import { verifyRecordings } from '@/game/replay/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: ReplayPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: 'Shared replay',
    description:
      'Watch a recorded Echo Heist solution replay through the same deterministic simulation the game uses.',
    alternates: { canonical: `/replay/${id}` },
    openGraph: {
      type: 'website',
      title: 'Shared replay — Echo Heist',
      description: 'Watch a verified Echo Heist solution replay in your browser.',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'Echo Heist — a ghost-replay stealth puzzle',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Shared replay — Echo Heist',
      description: 'Watch a verified Echo Heist solution replay in your browser.',
      images: ['/twitter-image'],
    },
    robots: { index: false, follow: false },
  };
}

class ReplayUnavailable extends Error {}

interface ReplayPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReplayPage({ params }: ReplayPageProps) {
  const { id } = await params;

  let content: ReactNode;
  try {
    const bundle = await decodeShareId(id);
    const level = levels.find((candidate) => candidate.id === bundle.level);
    if (!level) throw new ReplayUnavailable('That level is not part of this build.');

    const recordings = unpackShare(bundle);
    const result = verifyRecordings(level, recordings);
    if (!result.ok) throw new ReplayUnavailable(result.reason);

    content = (
      <ReplayPlayer
        level={level}
        recordings={recordings}
        runsUsed={result.runsUsed}
        totalTicks={result.totalTicks}
      />
    );
  } catch (error) {
    const known = error instanceof ReplayUnavailable || error instanceof ShareCodecError;
    if (!known) console.error('[replay] failed to load', error);
    content = (
      <ReplayError
        message={known ? (error as Error).message : 'This replay could not be loaded.'}
      />
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-ink p-4">
      <div className="my-auto w-full max-w-4xl">{content}</div>
    </main>
  );
}

function ReplayError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md border-4 border-iron bg-dusk p-6 shadow-pixel">
      <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-blood">
        Replay unavailable
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-wide text-bone">Nothing to play</h1>
      <p className="mt-2 text-xs leading-relaxed text-steel">{message}</p>
      <Link
        href="/"
        className="mt-6 inline-block border-2 border-aqua bg-aqua px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-ink transition hover:border-bone hover:bg-bone"
      >
        Back to Echo Heist
      </Link>
    </div>
  );
}
