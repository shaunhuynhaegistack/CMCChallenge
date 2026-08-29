#!/usr/bin/env node
/**
 * Creates a directory if it is not already there.
 *
 * k6 writes its summaries to a path it will not create itself, so something has
 * to exist first. This is that something, in TypeScript like everything else -
 * an inline `node -e` in a script would work and would be the one piece of
 * JavaScript left in the repository.
 *
 *   ts-node tools/ensure-dir.ts performance/results
 */
import fs from 'fs';

const [target] = process.argv.slice(2);

if (!target) {
  console.error('Usage: ensure-dir <path>');
  process.exit(1);
}

fs.mkdirSync(target, { recursive: true });
