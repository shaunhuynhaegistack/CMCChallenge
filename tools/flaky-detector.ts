#!/usr/bin/env node
/**
 * Flaky test detector.
 *
 * A scenario is treated as flaky when Cucumber had to run it more than once:
 * the first attempt failed and a retry produced a different outcome. The JSON
 * report only keeps the final attempt, so the detector reads the message stream
 * (`cucumber-messages.ndjson`), which records every `testCaseStarted` with its
 * attempt number.
 *
 * Usage:
 *   npm run flaky:check                       # report only
 *   npm run flaky:check -- --fail-on-flaky    # exit 1 when anything flaked
 */
import fs from 'fs';
import path from 'path';

/** A scenario that failed at least once and then passed on a retry. */
interface FlakyEntry {
  browser: string;
  scenario: string;
  attempts: number;
  finalStatus: string;
  firstFailure: string;
}

const REPORTS_DIR = path.join(process.cwd(), 'reports');
const HISTORY_FILE = path.join(REPORTS_DIR, 'flaky-history.json');
const FAIL_ON_FLAKY = process.argv.includes('--fail-on-flaky');

const readMessages = (file: string) =>
  fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

const analyseBrowser = (browser: string) => {
  const messagesFile = path.join(REPORTS_DIR, browser, 'cucumber-messages.ndjson');
  if (!fs.existsSync(messagesFile)) return [];

  const messages = readMessages(messagesFile);

  const pickleNames = new Map();
  const testCaseToPickle = new Map();
  const attemptsByTestCase = new Map();
  const statusByStartedId = new Map();
  const errorByStartedId = new Map();

  messages.forEach((message) => {
    if (message.pickle) {
      pickleNames.set(message.pickle.id, message.pickle.name);
    }

    if (message.testCase) {
      testCaseToPickle.set(message.testCase.id, message.testCase.pickleId);
    }

    if (message.testCaseStarted) {
      const { testCaseId, id, attempt } = message.testCaseStarted;
      const attempts = attemptsByTestCase.get(testCaseId) || [];
      attempts.push({ startedId: id, attempt });
      attemptsByTestCase.set(testCaseId, attempts);
    }

    if (message.testStepFinished) {
      const { testCaseStartedId, testStepResult } = message.testStepFinished;
      if (testStepResult?.status === 'FAILED') {
        statusByStartedId.set(testCaseStartedId, 'failed');
        if (!errorByStartedId.has(testCaseStartedId)) {
          errorByStartedId.set(
            testCaseStartedId,
            (testStepResult.message || '').split('\n')[0].trim()
          );
        }
      } else if (!statusByStartedId.has(testCaseStartedId)) {
        statusByStartedId.set(testCaseStartedId, 'passed');
      }
    }
  });

  return [...attemptsByTestCase.entries()]
    .filter(([, attempts]) => attempts.length > 1)
    .map(([testCaseId, attempts]) => {
      const ordered = [...attempts].sort((a, b) => a.attempt - b.attempt);
      const first = ordered[0];
      const last = ordered[ordered.length - 1];

      return {
        browser,
        scenario: pickleNames.get(testCaseToPickle.get(testCaseId)) || 'unknown scenario',
        attempts: ordered.length,
        finalStatus: statusByStartedId.get(last.startedId) || 'unknown',
        firstFailure: errorByStartedId.get(first.startedId) || 'unknown'
      };
    });
};

const listBrowsers = () =>
  fs.existsSync(REPORTS_DIR)
    ? fs
        .readdirSync(REPORTS_DIR)
        .filter((entry) => fs.statSync(path.join(REPORTS_DIR, entry)).isDirectory())
    : [];

/**
 * One flaky run is noise, the same scenario flaking week after week is a bug.
 * Keeping the counts in an artifact makes that trend visible instead of relying
 * on somebody remembering it.
 */
const updateHistory = (flaky: FlakyEntry[]): Record<string, number> => {
  let history: Record<string, number> = {};
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) as Record<string, number>;
    } catch {
      history = {};
    }
  }

  flaky.forEach((entry) => {
    const key = `${entry.browser} :: ${entry.scenario}`;
    history[key] = (history[key] || 0) + 1;
  });

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  return history;
};

const flaky = listBrowsers().flatMap(analyseBrowser);

if (flaky.length === 0) {
  console.log('No retried scenarios in this run.');
  process.exit(0);
}

const history = updateHistory(flaky);
const recovered = flaky.filter((entry) => entry.finalStatus === 'passed');

console.log(`${flaky.length} scenario(s) needed a retry, ${recovered.length} of them recovered:\n`);

flaky.forEach((entry) => {
  const key = `${entry.browser} :: ${entry.scenario}`;
  console.log(`- [${entry.browser}] ${entry.scenario}`);
  console.log(`    attempts      : ${entry.attempts} (final: ${entry.finalStatus})`);
  console.log(`    first failure : ${entry.firstFailure}`);
  console.log(`    seen flaky    : ${history[key]} run(s) so far`);
});

// Only a scenario that recovered is genuinely flaky. One that failed every
// attempt is simply broken and the run has already failed because of it.
process.exit(FAIL_ON_FLAKY && recovered.length > 0 ? 1 : 0);
