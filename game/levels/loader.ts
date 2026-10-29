import type {
  GuardDef,
  LaserDef,
  LevelDef,
  PlateLink,
  SolutionRun,
  SolutionWaypoint,
} from '../sim/types';

export interface LevelSource {
  file: string;
  data: unknown;
}

const ALLOWED_TILES = new Set(['#', '.', 'P', 'p', 'd', 'K', 'L', 'D', 'E']);

/**
 * Validates every level file and returns them sorted by id. All problems are
 * collected and thrown together with their file names so a malformed level
 * fails the build with an actionable message instead of a broken game.
 */
export function loadLevels(sources: LevelSource[]): LevelDef[] {
  const errors: string[] = [];
  const levels: LevelDef[] = [];
  const seenIds = new Map<number, string>();

  for (const source of sources) {
    const { level, errors: levelErrors } = validateLevel(source);
    errors.push(...levelErrors);
    if (!level) continue;

    const previousFile = seenIds.get(level.id);
    if (previousFile) {
      errors.push(`${source.file}: duplicate level id ${level.id} (already used by ${previousFile})`);
      continue;
    }
    seenIds.set(level.id, source.file);
    levels.push(level);
  }

  if (errors.length > 0) {
    throw new Error(`Level validation failed:\n- ${errors.join('\n- ')}`);
  }

  return levels.sort((a, b) => a.id - b.id);
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isPoint(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(isInt);
}

function isWaypoint(value: unknown): value is SolutionWaypoint {
  if (!Array.isArray(value)) return false;
  if (value.length !== 2 && value.length !== 3) return false;
  if (!isInt(value[0]) || !isInt(value[1])) return false;
  if (value.length === 3 && (!isInt(value[2]) || value[2] < 0)) return false;
  return true;
}

function inGrid(grid: string[], x: number, y: number): boolean {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[y].length;
}

function tileOf(grid: string[], x: number, y: number): string {
  return inGrid(grid, x, y) ? grid[y][x] : '';
}

function validateLevel({ file, data }: LevelSource): { level: LevelDef | null; errors: string[] } {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`${file}: ${message}`);

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { level: null, errors: [`${file}: root must be a JSON object`] };
  }
  const raw = data as Record<string, unknown>;

  if (!isInt(raw.id) || raw.id < 1) fail('"id" must be a positive integer');
  if (typeof raw.name !== 'string' || raw.name.trim() === '') fail('"name" must be a non-empty string');
  if (typeof raw.hint !== 'string' || raw.hint.trim() === '') fail('"hint" must be a non-empty string');
  if (!isInt(raw.maxRuns) || raw.maxRuns < 1 || raw.maxRuns > 10) {
    fail('"maxRuns" must be an integer between 1 and 10');
  }
  if (!isInt(raw.tickLimit) || raw.tickLimit < 60) {
    fail('"tickLimit" must be an integer of at least 60 ticks');
  }

  const grid = validateGrid(raw.grid, fail);
  const links = validateLinks(raw.links, grid, fail);
  const guards = validateGuards(raw.guards, grid, fail);
  const lasers = validateLasers(raw.lasers, grid, fail);
  const solution = validateSolution(raw.solution, raw.maxRuns, grid, fail);

  if (errors.length > 0) return { level: null, errors };

  return {
    level: {
      id: raw.id as number,
      name: raw.name as string,
      hint: raw.hint as string,
      maxRuns: raw.maxRuns as number,
      tickLimit: raw.tickLimit as number,
      grid,
      links,
      guards,
      lasers,
      solution,
    },
    errors,
  };
}

function validateGrid(value: unknown, fail: (message: string) => void): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail('"grid" must be a non-empty array of row strings');
    return [];
  }
  if (value.some((row) => typeof row !== 'string')) {
    fail('"grid" rows must all be strings');
    return [];
  }

  const grid = (value as string[]).slice();
  const width = grid[0].length;
  if (width === 0) fail('"grid" rows must not be empty');

  grid.forEach((row, y) => {
    if (row.length !== width) fail(`grid row ${y} has length ${row.length}, expected ${width}`);
    for (let x = 0; x < row.length; x += 1) {
      if (!ALLOWED_TILES.has(row[x])) {
        fail(
          `grid row ${y} column ${x} has unknown tile "${row[x]}" (allowed: ${[...ALLOWED_TILES].join(' ')})`,
        );
      }
    }
  });

  const joined = grid.join('');
  const count = (tile: string) => joined.split(tile).length - 1;
  if (count('P') !== 1) fail(`grid must contain exactly one spawn "P" (found ${count('P')})`);
  if (count('E') < 1) fail('grid must contain at least one exit "E"');
  if (count('D') < 1) fail('grid must contain at least one diamond "D"');

  return grid;
}

function validateLinks(value: unknown, grid: string[], fail: (message: string) => void): PlateLink[] {
  const links: PlateLink[] = [];
  if (value === undefined) return links;
  if (!Array.isArray(value)) {
    fail('"links" must be an array');
    return links;
  }

  value.forEach((entry, i) => {
    const link = entry as Record<string, unknown>;
    if (!isPoint(link?.plate) || !isPoint(link?.door)) {
      fail(`links[${i}] must have "plate" and "door" as [x, y] integer pairs`);
      return;
    }
    const [px, py] = link.plate;
    const [dx, dy] = link.door;
    if (grid.length > 0) {
      if (!inGrid(grid, px, py)) fail(`links[${i}].plate [${px}, ${py}] is outside the grid`);
      else if (tileOf(grid, px, py) !== 'p') {
        fail(`links[${i}].plate [${px}, ${py}] must sit on a "p" tile (found "${tileOf(grid, px, py)}")`);
      }
      if (!inGrid(grid, dx, dy)) fail(`links[${i}].door [${dx}, ${dy}] is outside the grid`);
      else if (tileOf(grid, dx, dy) !== 'd') {
        fail(`links[${i}].door [${dx}, ${dy}] must sit on a "d" tile (found "${tileOf(grid, dx, dy)}")`);
      }
    }
    links.push({ plate: [px, py], door: [dx, dy] });
  });

  return links;
}

function validateGuards(value: unknown, grid: string[], fail: (message: string) => void): GuardDef[] {
  const guards: GuardDef[] = [];
  if (value === undefined) return guards;
  if (!Array.isArray(value)) {
    fail('"guards" must be an array');
    return guards;
  }

  value.forEach((entry, i) => {
    const guard = entry as Record<string, unknown>;
    const rawPath = guard?.path;
    if (!Array.isArray(rawPath) || rawPath.length < 2 || !rawPath.every(isPoint)) {
      fail(`guards[${i}].path must be at least two [x, y] integer pairs`);
      return;
    }
    if (!isInt(guard?.speed) || guard.speed < 1) {
      fail(`guards[${i}].speed must be a positive integer (ticks per tile)`);
      return;
    }
    const path = rawPath as [number, number][];

    if (grid.length === 0) {
      guards.push({ path, speed: guard.speed });
      return;
    }

    let ok = true;
    for (let j = 0; j < path.length && ok; j += 1) {
      const from = path[j];
      const to = path[(j + 1) % path.length];
      if (!inGrid(grid, from[0], from[1]) || !inGrid(grid, to[0], to[1])) {
        fail(
          `guards[${i}].path[${j}] [${from[0]}, ${from[1]}] -> [${to[0]}, ${to[1]}] leaves the grid`,
        );
        ok = false;
        break;
      }
      if (from[0] === to[0] && from[1] === to[1]) {
        fail(`guards[${i}].path[${j}] repeats its previous waypoint`);
        ok = false;
        break;
      }
      if (from[0] !== to[0] && from[1] !== to[1]) {
        fail(`guards[${i}] leg ${j} -> ${(j + 1) % path.length} is diagonal; guards walk axis-aligned paths`);
        ok = false;
        break;
      }

      let x = from[0];
      let y = from[1];
      const sx = Math.sign(to[0] - x);
      const sy = Math.sign(to[1] - y);
      while (x !== to[0] || y !== to[1]) {
        x += sx;
        y += sy;
        const tile = tileOf(grid, x, y);
        if (tile !== '.') {
          fail(
            `guards[${i}] walks onto "${tile}" at [${x}, ${y}] (guard paths must stay on floor ".")`,
          );
          ok = false;
          break;
        }
      }
    }

    if (ok) guards.push({ path, speed: guard.speed });
  });

  return guards;
}

function validateLasers(value: unknown, grid: string[], fail: (message: string) => void): LaserDef[] {
  const lasers: LaserDef[] = [];
  if (value === undefined) return lasers;
  if (!Array.isArray(value)) {
    fail('"lasers" must be an array');
    return lasers;
  }

  value.forEach((entry, i) => {
    const laser = entry as Record<string, unknown>;
    const rawTiles = laser?.tiles;
    if (!Array.isArray(rawTiles) || rawTiles.length === 0 || !rawTiles.every(isPoint)) {
      fail(`lasers[${i}].tiles must be a non-empty array of [x, y] integer pairs`);
      return;
    }

    let ok = true;
    const tiles: [number, number][] = [];
    const seen = new Set<string>();
    for (const [x, y] of rawTiles as [number, number][]) {
      if (grid.length > 0) {
        if (!inGrid(grid, x, y)) {
          fail(`lasers[${i}] tile [${x}, ${y}] is outside the grid`);
          ok = false;
          continue;
        }
        if (tileOf(grid, x, y) === '#') {
          fail(`lasers[${i}] tile [${x}, ${y}] sits on a wall`);
          ok = false;
          continue;
        }
      }
      const key = `${x},${y}`;
      if (seen.has(key)) {
        fail(`lasers[${i}] lists tile [${x}, ${y}] twice`);
        ok = false;
        continue;
      }
      seen.add(key);
      tiles.push([x, y]);
    }

    const hasCycle = laser?.cycle !== undefined;
    const hasPlate = laser?.plate !== undefined;
    if (hasCycle === hasPlate) {
      fail(`lasers[${i}] must have exactly one of "cycle" or "plate"`);
      ok = false;
    }

    let cycle: LaserDef['cycle'];
    if (hasCycle) {
      const rawCycle = laser.cycle as Record<string, unknown>;
      const onTicks = rawCycle?.onTicks;
      const offTicks = rawCycle?.offTicks;
      const phase = rawCycle?.phase;
      if (!isInt(onTicks) || onTicks < 1) {
        fail(`lasers[${i}].cycle.onTicks must be an integer of at least 1 tick`);
        ok = false;
      }
      if (!isInt(offTicks) || offTicks < 1) {
        fail(`lasers[${i}].cycle.offTicks must be an integer of at least 1 tick`);
        ok = false;
      }
      if (phase !== undefined && (!isInt(phase) || phase < 0)) {
        fail(`lasers[${i}].cycle.phase must be a non-negative integer`);
        ok = false;
      }
      if (isInt(onTicks) && isInt(offTicks)) {
        cycle = { onTicks, offTicks, phase: isInt(phase) ? phase : undefined };
      }
    }

    let plate: [number, number] | undefined;
    if (hasPlate) {
      if (!isPoint(laser.plate)) {
        fail(`lasers[${i}].plate must be an [x, y] integer pair`);
        ok = false;
      } else {
        const [px, py] = laser.plate as [number, number];
        if (grid.length > 0) {
          if (!inGrid(grid, px, py)) {
            fail(`lasers[${i}].plate [${px}, ${py}] is outside the grid`);
            ok = false;
          } else if (tileOf(grid, px, py) !== 'p') {
            fail(
              `lasers[${i}].plate [${px}, ${py}] must sit on a "p" tile (found "${tileOf(grid, px, py)}")`,
            );
            ok = false;
          }
        }
        plate = [px, py];
      }
    }

    if (ok) lasers.push({ tiles, cycle, plate });
  });

  return lasers;
}

function validateSolution(
  value: unknown,
  maxRuns: unknown,
  grid: string[],
  fail: (message: string) => void,
): SolutionRun[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail('"solution" must be a non-empty array of runs');
    return [];
  }
  if (isInt(maxRuns) && value.length > maxRuns) {
    fail(`"solution" lists ${value.length} runs but "maxRuns" is only ${maxRuns}`);
  }

  const runs: SolutionRun[] = [];

  value.forEach((entry, i) => {
    const run = entry as Record<string, unknown>;

    if (typeof run?.description !== 'string' || run.description.trim() === '') {
      fail(`solution[${i}].description must be a non-empty string`);
    }

    const rawPath = run?.path;
    if (!Array.isArray(rawPath) || rawPath.length === 0) {
      fail(`solution[${i}].path must be a non-empty array of [x, y] waypoints`);
      return;
    }

    const path: SolutionWaypoint[] = [];
    let pathOk = true;
    rawPath.forEach((point, j) => {
      if (!isWaypoint(point)) {
        fail(
          `solution[${i}].path[${j}] must be [x, y] or [x, y, waitTicks] with integer coordinates and a non-negative wait`,
        );
        pathOk = false;
        return;
      }
      const [x, y] = point;
      if (grid.length > 0) {
        if (!inGrid(grid, x, y)) {
          fail(`solution[${i}].path[${j}] [${x}, ${y}] is outside the grid`);
          pathOk = false;
          return;
        }
        if (tileOf(grid, x, y) === '#') {
          fail(`solution[${i}].path[${j}] [${x}, ${y}] points at a wall`);
          pathOk = false;
          return;
        }
      }
      path.push(point);
    });

    for (let j = 1; j < path.length; j += 1) {
      if (path[j][0] !== path[j - 1][0] && path[j][1] !== path[j - 1][1]) {
        fail(`solution[${i}] leg ${j - 1} -> ${j} is diagonal; insert corner waypoints`);
      }
    }

    const end = run?.end;
    if (end !== 'run' && end !== 'win') {
      fail(`solution[${i}].end must be "run" or "win"`);
    }
    if (end === 'win' && i < value.length - 1) {
      fail(`solution[${i}] ends with "win" but is not the last run`);
    }

    const holdTicks = run?.holdTicks;
    if (holdTicks !== undefined && (!isInt(holdTicks) || holdTicks < 0)) {
      fail(`solution[${i}].holdTicks must be a non-negative integer`);
    }

    if (pathOk) {
      runs.push({
        description: typeof run.description === 'string' ? run.description : `run ${i + 1}`,
        path,
        holdTicks: isInt(holdTicks) ? holdTicks : undefined,
        end: end === 'win' ? 'win' : 'run',
      });
    }
  });

  const last = value[value.length - 1] as Record<string, unknown>;
  if (last?.end !== 'win') fail('the last solution run must end with "win"');

  return runs;
}
