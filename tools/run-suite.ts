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
import { signIn, normaliseLocalization } from '../lib/api/instance';
import { logInfo, logWarn } from '../lib/logger';

const [browser, ...passThrough] = process.argv.slice(2);

if (!browser) {
  console.error('Usage: run-suite <profile> [extra cucumber-js arguments]');
  process.exit(1);
}

// The showcase profile is the deliberate failure, run on Chromium. It is the one
// profile whose name is not an engine, and the one that must never retry - a
// retried failure would take three times as long to arrive at the same place.
const isShowcase = browser === 'showcase';

// The localization profile changes instance-wide settings - the display
// language and the date format - so nothing else can be running while it does.
// One worker, whatever the environment says.
const isLocalization = browser === 'localization';
const engine = isShowcase || isLocalization ? 'chromium' : browser;
const retries = isShowcase ? 0 : environment.execution.retries;
const workers = isLocalization ? 1 : environment.execution.workers;

const args = [
  '--profile',
  browser,
  '--parallel',
  String(workers),
  '--retry',
  String(retries),
  ...(environment.stability.retryTagFilter
    ? ['--retry-tag-filter', environment.stability.retryTagFilter]
    : []),
  ...passThrough
];

/**
 * The precondition every run needs, because the target is shared.
 *
 * The display language and the date format are instance-wide settings that
 * anyone with access can change, and both decide whether a scenario can even
 * find what it is looking for: the language sets the label on every control,
 * the date format sets how a stored date is rendered. A run that starts without
 * checking them is a run whose failures say nothing about the code.
 *
 * So the suite does not start until the instance is in the state it expects.
 * Failing here is deliberate - a clear sentence about the environment beats
 * thirty assertion failures that all point at the wrong thing.
 */
const applyPreconditions = async (): Promise<void> => {
  const cookie = await signIn(environment.baseUrl);
  const { before, changed } = await normaliseLocalization(environment.baseUrl, cookie);

  if (changed) {
    logWarn(
      `The instance was set to language "${before.language}" and date format ` +
        `"${before.dateFormat}". Both have been reset for this run.`
    );
  } else {
    logInfo(`Instance ready: language ${before.language}, date format ${before.dateFormat}`);
  }
};

const run = async (): Promise<never> => {
  try {
    await applyPreconditions();
  } catch (error) {
    console.error(`Preconditions failed: ${(error as Error).message}`);
    process.exit(1);
  }

  const cucumber = path.join('node_modules', '.bin', 'cucumber-js');
  const result = spawnSync(cucumber, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, BROWSER: engine }
  });

  process.exit(result.status ?? 1);
};

void run();
