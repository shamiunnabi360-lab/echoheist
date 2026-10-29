import level09 from '../levels/level-09.json';
import level10 from '../levels/level-10.json';
import level11 from '../levels/level-11.json';
import { verifySolution } from '../game/levels/solutionRunner';
import type { LevelDef } from '../game/sim/types';

function clone(level: unknown): LevelDef {
  return JSON.parse(JSON.stringify(level)) as LevelDef;
}

function expect(level: LevelDef, label: string, shouldPass: boolean, hint: string): boolean {
  const result = verifySolution(level);
  const ok = result.passed === shouldPass;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}: ${result.message}`);
  if (!ok) console.log(`     expected ${shouldPass ? 'pass' : `failure (${hint})`}`);
  return ok;
}

let ok = true;
const l9 = clone(level09);
const l10 = clone(level10);
const l11 = clone(level11);

ok = expect(l9, 'level 9 baseline', true, '') && ok;

const noBeamGhost = clone(level10);
noBeamGhost.maxRuns = 1;
noBeamGhost.solution = [noBeamGhost.solution[1]];
ok = expect(noBeamGhost, 'level 10 without the plate ghost', false, 'laser')

  && ok;

const noWait = clone(level10);
noWait.solution[1].path[0] = [9, 1];
ok = expect(noWait, 'level 10 without waiting for the cycle', false, 'laser') && ok;

const noDistraction = clone(level11);
noDistraction.maxRuns = 2;
noDistraction.solution = [noDistraction.solution[0], noDistraction.solution[2]];
ok = expect(noDistraction, 'level 11 without the distraction echo', false, 'caught') && ok;

const noPlateGhost = clone(level11);
noPlateGhost.maxRuns = 2;
noPlateGhost.solution = [noPlateGhost.solution[1], noPlateGhost.solution[2]];
ok = expect(noPlateGhost, 'level 11 without the plate ghost', false, 'laser') && ok;

process.exitCode = ok ? 0 : 1;
