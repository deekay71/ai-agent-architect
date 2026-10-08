import { portableCommand } from '../dist/src/portable/cli.js';

try {
  await portableCommand(process.argv.slice(2));
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : 'PORTABLE_STOPPED') + '\n');
  process.exitCode = 1;
}

