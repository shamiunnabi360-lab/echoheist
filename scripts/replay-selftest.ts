import level01 from '../levels/level-01.json';
import level09 from '../levels/level-09.json';
import level10 from '../levels/level-10.json';
import level11 from '../levels/level-11.json';
import { verifyReplayDeterminism } from '../game/sim/replaySelfTest';
import type { LevelDef } from '../game/sim/types';

const levels: { file: string; level: LevelDef }[] = [
  { file: 'level-01', level: level01 as unknown as LevelDef },
  { file: 'level-09', level: level09 as unknown as LevelDef },
  { file: 'level-10', level: level10 as unknown as LevelDef },
  { file: 'level-11', level: level11 as unknown as LevelDef },
];

let failed = false;
for (const { file, level } of levels) {
  const replay = verifyReplayDeterminism(level);
  if (replay.passed) {
    console.log(`[echo-heist] ${file} replay self-test PASS: ${replay.message}`);
  } else {
    failed = true;
    console.error(`[echo-heist] ${file} replay self-test FAIL: ${replay.message}`);
  }
}

process.exit(failed ? 1 : 0);
