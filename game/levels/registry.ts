import level01 from '../../levels/level-01.json';
import level02 from '../../levels/level-02.json';
import level03 from '../../levels/level-03.json';
import level04 from '../../levels/level-04.json';
import level05 from '../../levels/level-05.json';
import level06 from '../../levels/level-06.json';
import level07 from '../../levels/level-07.json';
import level08 from '../../levels/level-08.json';
import level09 from '../../levels/level-09.json';
import level10 from '../../levels/level-10.json';
import level11 from '../../levels/level-11.json';
import { loadLevels } from './loader';

/**
 * The whole level pack, validated at module load. Adding a level means adding
 * one JSON file and one import here — no engine or UI changes.
 */
const levels = loadLevels([
  { file: 'levels/level-01.json', data: level01 },
  { file: 'levels/level-02.json', data: level02 },
  { file: 'levels/level-03.json', data: level03 },
  { file: 'levels/level-04.json', data: level04 },
  { file: 'levels/level-05.json', data: level05 },
  { file: 'levels/level-06.json', data: level06 },
  { file: 'levels/level-07.json', data: level07 },
  { file: 'levels/level-08.json', data: level08 },
  { file: 'levels/level-09.json', data: level09 },
  { file: 'levels/level-10.json', data: level10 },
  { file: 'levels/level-11.json', data: level11 },
]);

export default levels;
