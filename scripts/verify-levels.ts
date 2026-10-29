import { verifySolution } from '../game/levels/solutionRunner';

async function main(): Promise<void> {
  try {
    const { default: levels } = await import('../game/levels/registry');

    let failures = 0;
    for (const level of levels) {
      const result = verifySolution(level);
      const line = `level ${String(level.id).padStart(2, '0')}  ${level.name.padEnd(18)} ${result.message}`;
      if (result.passed) {
        console.log(`PASS  ${line}`);
      } else {
        failures += 1;
        console.error(`FAIL  ${line}`);
      }
    }

    console.log(`\n${levels.length - failures}/${levels.length} levels verified`);
    if (failures > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
