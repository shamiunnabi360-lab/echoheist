import GameShell from '@/components/GameShell';

export default function Home() {
  return (
    <main className="flex min-h-screen justify-center bg-ink p-4">
      <div className="my-auto flex w-full justify-center">
        <GameShell />
      </div>
    </main>
  );
}
