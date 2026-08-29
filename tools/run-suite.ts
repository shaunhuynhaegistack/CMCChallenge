#!/usr/bin/env node
/**
 * Runs the suite for one browser.
 *
 * Cucumber reads its configuration from JavaScript, JSON or YAML and never from
 * TypeScript, so the static shape of each profile lives in cucumber.yaml. Two
 * settings cannot live there: how many workers and how many retries are
 * properties of the *environment* rather than of the profile - four workers and
 * two retries on CI, two and none locally - and a YAML file cannot resolve that.
 * This runner resolves the environment and passes them on the command line.
 *
 * It also sets BROWSER, which is what the World reads to decide which engine to
 * launch, so a run is one word rather than an environment variable a reader has
 * to remember.
 *
 *   npm run test:chromium
 *   npm run test:chromium -- --tags @smoke
 */
import { spawnSync } from 'child_process';
import path from 'path';
import environment from '../lib/config/environment';

const [browser, ...passThrough] = process.argv.slice(2);

if (!browser) {
  console.error('Usage: run-suite <profile> [extra cucumber-js arguments]');
  process.exit(1);
}

// The showcase profile is the deliberate failure, run on Chromium. It is the one
// profile whose name is not an engine, and the one that must never retry - a
// retried failure would take three times as long to arrive at the same place.
const isShowcase = browser === 'showcase';
const engine = isShowcase ? 'chromium' : browser;
const retries = isShowcase ? 0 : environment.execution.retries;

const args = [
  '--profile',
  browser,
  '--parallel',
  String(environment.execution.workers),
  '--retry',
  String(retries),
  ...(environment.stability.retryTagFilter
    ? ['--retry-tag-filter', environment.stability.retryTagFilter]
    : []),
  ...passThrough
];

const cucumber = path.join('node_modules', '.bin', 'cucumber-js');
const result = spawnSync(cucumber, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, BROWSER: engine }
});

process.exit(result.status ?? 1);
