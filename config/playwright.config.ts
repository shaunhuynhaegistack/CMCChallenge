import { defineConfig, devices } from '@playwright/test';
import environment from '../lib/config/environment';

/**
 * Playwright is used as a library here (Cucumber owns the runner), so this file
 * mainly exists to keep browser settings declarative and shared. Values come
 * from the resolved environment, never from `process.env` directly.
 */
export default defineConfig({
  timeout: environment.timeouts.step,
  expect: { timeout: environment.timeouts.expect },
  retries: environment.execution.retries,
  workers: environment.execution.workers,
  use: {
    baseURL: environment.baseUrl,
    headless: environment.execution.headless,
    // slowMo is a launch option rather than a context option; see the README for
    // why the suite runs with a small delay by default.
    launchOptions: { slowMo: environment.execution.slowMo },
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    actionTimeout: environment.timeouts.action,
    navigationTimeout: environment.timeouts.navigation
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], browserName: 'chromium' } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], browserName: 'firefox' } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], browserName: 'webkit' } }
  ]
});
