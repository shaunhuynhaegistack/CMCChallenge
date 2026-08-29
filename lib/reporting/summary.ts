import fs from 'fs';
import path from 'path';

export interface Totals {
  scenarios: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

export interface FailedScenario {
  feature: string;
  scenario: string;
}

export interface FileSummary {
  totals: Totals;
  failedScenarios: FailedScenario[];
  unreadable?: boolean;
}

export interface BrowserSummary extends FileSummary {
  browser: string;
}

interface CucumberStep {
  result?: { status?: string; duration?: number };
}

interface CucumberScenario {
  name: string;
  steps?: CucumberStep[];
}

interface CucumberFeature {
  name: string;
  elements?: CucumberScenario[];
}

// Resolved on every call rather than at import time: the working directory is
// the only thing that says where the reports are, and freezing it here would
// make the module untestable and surprising for any caller that changes it.
const reportsDir = (): string => path.join(process.cwd(), 'reports');

const emptyTotals = (): Totals => ({
  scenarios: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  durationMs: 0
});

/**
 * Reduces the Cucumber JSON of one browser into the numbers a human actually
 * wants: how many scenarios ran, how many failed, and how long it took.
 * A scenario counts as failed if any of its steps failed.
 */
const summariseFile = (jsonPath: string): FileSummary => {
  const totals = emptyTotals();
  const failedScenarios: FailedScenario[] = [];

  // An interrupted run leaves a truncated file behind; treat that as "no
  // results" rather than crashing the reporting step.
  let features: CucumberFeature[];
  try {
    features = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as CucumberFeature[];
  } catch {
    return { totals, failedScenarios, unreadable: true };
  }

  features.forEach((feature) => {
    (feature.elements || []).forEach((scenario) => {
      totals.scenarios += 1;

      const statuses = (scenario.steps || []).map((step) => step.result?.status);
      totals.durationMs += (scenario.steps || []).reduce(
        (sum: number, step) => sum + (step.result?.duration || 0) / 1e6,
        0
      );

      if (statuses.includes('failed')) {
        totals.failed += 1;
        failedScenarios.push({ feature: feature.name, scenario: scenario.name });
      } else if (statuses.every((status) => status === 'skipped' || status === undefined)) {
        totals.skipped += 1;
      } else {
        totals.passed += 1;
      }
    });
  });

  return { totals, failedScenarios };
};

export const collect = (): BrowserSummary[] => {
  const root = reportsDir();
  if (!fs.existsSync(root)) return [];

  return fs
    .readdirSync(root)
    .filter((entry) => fs.statSync(path.join(root, entry)).isDirectory())
    .map((browser) => ({ browser, jsonPath: path.join(root, browser, 'cucumber-report.json') }))
    .filter((entry) => fs.existsSync(entry.jsonPath))
    .map((entry) => ({ browser: entry.browser, ...summariseFile(entry.jsonPath) }));
};

export const combine = (results: BrowserSummary[]): Totals =>
  results.reduce((acc, result) => {
    acc.scenarios += result.totals.scenarios;
    acc.passed += result.totals.passed;
    acc.failed += result.totals.failed;
    acc.skipped += result.totals.skipped;
    acc.durationMs += result.totals.durationMs;
    return acc;
  }, emptyTotals());

export const formatDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
};
