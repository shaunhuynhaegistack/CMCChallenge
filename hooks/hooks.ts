import fs from 'fs';
import path from 'path';
import {
  Before,
  BeforeStep,
  After,
  BeforeAll,
  AfterAll,
  Status,
  ITestCaseHookParameter
} from '@cucumber/cucumber';
import { logAction, logInfo, logWarn, logError } from '../lib/logger';
import environment from '../lib/config/environment';
import type { OrangeHrmWorld } from '../support/world';

const browserName = (): string => process.env.BROWSER || 'chromium';
const artefactDir = (...segments: string[]): string =>
  path.join('reports', browserName(), ...segments);

/**
 * Moves the recording Playwright wrote for a scenario to a readable name, or
 * removes it. Called after the context is closed, which is the only point at
 * which the file exists.
 */
const settleVideo = (videoDir: string | null, keepAs: string | null): string | null => {
  if (!videoDir || !fs.existsSync(videoDir)) return null;

  if (!keepAs) {
    fs.rmSync(videoDir, { recursive: true, force: true });
    return null;
  }

  const [recording] = fs.readdirSync(videoDir).filter((file) => file.endsWith('.webm'));
  if (!recording) {
    fs.rmSync(videoDir, { recursive: true, force: true });
    return null;
  }

  const target = artefactDir('videos', `${keepAs}.webm`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(path.join(videoDir, recording), target);
  fs.rmSync(videoDir, { recursive: true, force: true });
  return target;
};

// Cucumber runs BeforeAll and AfterAll once per worker process, so anything
// logged there appears once per worker. The run banner is a property of the run,
// not of the worker, so only the first one prints it.
const isFirstWorker = (): boolean =>
  !process.env.CUCUMBER_WORKER_ID || process.env.CUCUMBER_WORKER_ID === '0';

BeforeAll(async function () {
  fs.mkdirSync(artefactDir('screenshots'), { recursive: true });
  if (isFirstWorker()) {
    logInfo(`Test run started against ${process.env.BASE_URL || 'the default base URL'}`);
  }
});

AfterAll(async function () {
  if (isFirstWorker()) logInfo('Test run finished');
});

/**
 * Records the engine version once per run so the report shows "Chromium 141"
 * instead of a placeholder. Workers race to write it; they all write the same
 * value, so the last one wins harmlessly.
 */
const writeRunMetadata = (world: OrangeHrmWorld): void => {
  // Kept beside the browser's own results so it travels with the artifact and
  // the report job can name the engine even though it never ran the browser.
  // Safe here because the reporter is pointed at an isolated cucumber-json/
  // directory rather than at this folder.
  const file = artefactDir('run-metadata.json');
  if (fs.existsSync(file)) return;
  fs.writeFileSync(
    file,
    JSON.stringify(
      { browser: world.browserName, engine: browserName(), version: world.browser.version() },
      null,
      2
    )
  );
};

Before(async function (this: OrangeHrmWorld, scenario: ITestCaseHookParameter) {
  this.scenarioName = scenario.pickle.name;
  this.scenarioTags = scenario.pickle.tags.map((tag) => tag.name);
  logInfo(`Starting scenario: ${this.scenarioName} [${this.scenarioTags.join(' ') || 'untagged'}]`);
  await this.init();
  writeRunMetadata(this);
  await this.startTracing();
});

/*
 * Cucumber runs After hooks in reverse declaration order, so the hooks below are
 * declared from "last to run" to "first to run":
 *   1. capture evidence (needs a live page)
 *   2. close the secondary session, if the scenario opened one
 *   3. delete the data the scenario created (needs the authenticated API context)
 *   4. close the browser
 *   5. keep or discard the video (only written once the context is closed)
 */

After(
  { name: 'Keep or discard the video' },
  async function (this: OrangeHrmWorld, scenario: ITestCaseHookParameter) {
    const keep =
      environment.stability.video === 'on' ||
      (environment.stability.video === 'retain-on-failure' &&
        scenario.result?.status === Status.FAILED);

    const saved = settleVideo(this.videoDir, keep ? this.evidenceSlug : null);
    if (saved) {
      this.attach(`Video: ${saved}`, 'text/plain');
      logInfo(`Video kept at ${saved}`);
    }
  }
);

After({ name: 'Close the browser' }, async function (this: OrangeHrmWorld) {
  await this.cleanup();
});

After({ name: 'Remove the data created by the scenario' }, async function (this: OrangeHrmWorld) {
  if (!this.api) return;

  // A single attempt: the scenario is over, and retrying teardown against a
  // struggling instance turns a slow run into a stuck one. A leftover record is
  // a smaller problem than a hung job.
  const once = { attempts: 1 };

  if (this.created.users.length) {
    await this.api
      .deleteUsers(this.created.users, once)
      .catch((error: Error) => logWarn(error.message));
  }
  if (this.created.employees.length) {
    await this.api
      .deleteEmployees(this.created.employees, once)
      .catch((error: Error) => logWarn(error.message));
  }
  if (this.created.candidates.length) {
    await this.api
      .deleteCandidates(this.created.candidates, once)
      .catch((error: Error) => logWarn(error.message));
  }
});

After({ name: 'Close any secondary session' }, async function (this: OrangeHrmWorld) {
  if (this.state && this.state.essSession) {
    await this.state.essSession.context.close().catch(() => {});
    this.state.essSession = null;
  }
  if (this.anonymousContext) {
    await this.anonymousContext.close().catch(() => {});
    this.anonymousContext = undefined;
  }
});

// One line per Gherkin step, so the actions underneath it have something to
// belong to when the log is read months later.
BeforeStep(function ({ pickleStep }) {
  logAction(`Step: ${pickleStep.text}`);
});

After(
  { name: 'Report the scenario result' },
  async function (this: OrangeHrmWorld, scenario: ITestCaseHookParameter) {
    const status = scenario.result?.status;
    const line = `Scenario: ${this.scenarioName} - ${String(status).toUpperCase()}`;
    if (status === Status.PASSED) logInfo(line);
    else if (status === Status.FAILED) logError(line);
    else logWarn(line);
  }
);

After(
  { name: 'Capture evidence on failure' },
  async function (this: OrangeHrmWorld, scenario: ITestCaseHookParameter) {
    const failed = scenario.result?.status === Status.FAILED;

    if (!failed) {
      await this.stopTracing();
      // 'on' keeps the video for passing scenarios too, so it still needs a name.
      this.evidenceSlug = `${this.scenarioName.replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}`;
      return;
    }

    const slug = `${this.scenarioName.replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}`;
    this.evidenceSlug = slug;

    const buffer = await this.screenshot();
    if (buffer) {
      fs.writeFileSync(path.join(artefactDir('screenshots'), `${slug}.png`), buffer);
      // Attaching the image puts it inside the HTML report next to the failing
      // step, so the report is self contained.
      this.attach(buffer, 'image/png');
    }

    fs.mkdirSync(artefactDir('traces'), { recursive: true });
    await this.stopTracing(path.join(artefactDir('traces'), `${slug}.zip`)).catch(() => {});

    // `willBeRetried` is true while Cucumber still has an attempt left, so the log
    // distinguishes "failed and will try again" from "failed for good".
    logError(
      scenario.willBeRetried
        ? `Scenario failed and will be retried - evidence saved as ${slug}`
        : `Scenario failed - evidence saved as ${slug}`
    );
  }
);
