'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { audio } from '@/game/audio';
import levels from '@/game/levels/registry';
import {
  clearedCount,
  emptyProgress,
  firstUnclearedIndex,
  isCompleted,
  loadProgress,
  recordWin,
  saveProgress,
  withMuted,
  type Progress,
} from '@/game/progress';
import GameCanvas from './GameCanvas';
import LevelSelect from './LevelSelect';
import MainMenu from './MainMenu';

type Screen = 'menu' | 'select' | 'play';

export default function GameShell() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [loaded, setLoaded] = useState(false);

  const levelIds = useMemo(() => levels.map((level) => String(level.id)), []);

  // Progress lives in localStorage, so it can only be read after hydration.
  useEffect(() => {
    const saved = loadProgress();
    setProgress(saved);
    audio.setMuted(saved.muted);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveProgress(progress);
  }, [loaded, progress]);

  const cleared = clearedCount(progress, levelIds);
  const frontier = firstUnclearedIndex(progress, levelIds);
  const continueLevel = frontier === -1 ? null : levels[frontier];
  const allCleared = frontier === -1;

  const toggleMute = useCallback(() => {
    audio.unlock();
    setProgress((current) => {
      const next = withMuted(current, !current.muted);
      audio.setMuted(next.muted);
      return next;
    });
  }, []);

  const startLevel = useCallback((nextIndex: number) => {
    audio.unlock();
    setIndex(nextIndex);
    setScreen('play');
  }, []);

  const handleContinue = useCallback(() => {
    if (frontier === -1) setScreen('select');
    else startLevel(frontier);
  }, [frontier, startLevel]);

  const handleWin = useCallback(
    (runNumber: number) => {
      const id = levelIds[index];
      if (!id) return;
      setProgress((current) => recordWin(current, id, runNumber));
    },
    [index, levelIds],
  );

  const handleNextLevel = useCallback(() => {
    if (index + 1 < levels.length) startLevel(index + 1);
    else setScreen('select');
  }, [index, startLevel]);

  const handleExit = useCallback(() => setScreen('select'), []);

  if (screen === 'menu') {
    return (
      <MainMenu
        totalLevels={levels.length}
        clearedLevels={cleared}
        completedFlags={levels.map((level) => isCompleted(progress, String(level.id)))}
        continueLabel={
          continueLevel
            ? `Level ${continueLevel.id} — ${continueLevel.name}`
            : 'All vaults cracked — choose a vault'
        }
        allCleared={allCleared}
        muted={progress.muted}
        onContinue={handleContinue}
        onLevelSelect={() => setScreen('select')}
        onToggleMute={toggleMute}
      />
    );
  }

  if (screen === 'select') {
    return (
      <LevelSelect
        levels={levels}
        progress={progress}
        muted={progress.muted}
        onSelect={startLevel}
        onBack={() => setScreen('menu')}
        onToggleMute={toggleMute}
      />
    );
  }

  const level = levels[index];

  return (
    <GameCanvas
      key={level.id}
      level={level}
      levelCount={levels.length}
      hasNext={index + 1 < levels.length}
      muted={progress.muted}
      onWin={handleWin}
      onNextLevel={handleNextLevel}
      onExit={handleExit}
      onToggleMute={toggleMute}
    />
  );
}
