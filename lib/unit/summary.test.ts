import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { collect, combine, formatDuration } from '../reporting/summary';

// `collect` reads reports/ relative to the working directory, so the fixture is
// laid out in a temporary directory and the process is moved into it.
const inFixtureWorkspace = (assertion: () => void): void => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'summary-test-'));
  const browserDir = path.join(root, 'reports', 'chromium');
  fs.mkdirSync(browserDir, { recursive: true });
  fs.copyFileSync(
    path.join(__dirname, 'fixtures', 'cucumber-report.json'),
    path.join(browserDir, 'cucumber-report.json')
  );

  const previous = process.cwd();
  process.chdir(root);
  try {
    assertion();
  } finally {
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test('a scenario counts as failed when any of its steps failed', () => {
  inFixtureWorkspace(() => {
    const [result] = collect();

    assert.equal(result.browser, 'chromium');
    assert.deepEqual(
      { ...result.totals, durationMs: undefined },
      { scenarios: 3, passed: 1, failed: 1, skipped: 1, durationMs: undefined }
    );
    assert.deepEqual(result.failedScenarios, [
      { feature: 'Authentication', scenario: 'Sign in is rejected for unknownUser' }
    ]);
  });
});

test('durations are summed across browsers and rendered for humans', () => {
  inFixtureWorkspace(() => {
    const totals = combine(collect());
    assert.equal(totals.durationMs, 4500);
    assert.equal(formatDuration(totals.durationMs), '5s');
  });
});

test('formatDuration switches to minutes past sixty seconds', () => {
  assert.equal(formatDuration(95000), '1m 35s');
});

test('an unreadable report is reported as empty rather than crashing', () => {
  inFixtureWorkspace(() => {
    fs.writeFileSync(path.join('reports', 'chromium', 'cucumber-report.json'), '{ truncated');
    const [result] = collect();
    assert.equal(result.unreadable, true);
    assert.equal(result.totals.scenarios, 0);
  });
});
