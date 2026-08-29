import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type { Environment } from '../types';

dotenv.config();

const ENVIRONMENT_DIR = path.join(__dirname, '..', '..', 'config', 'environments');
const DEFAULT_ENVIRONMENT = 'demo';

interface EnvironmentFile {
  name: string;
  baseUrl: string;
  apiBasePath: string;
  timeouts: Environment['timeouts'];
  execution: Omit<Environment['execution'], 'browser'>;
}

const readEnvironmentFile = (name: string): EnvironmentFile => {
  const filePath = path.join(ENVIRONMENT_DIR, `${name}.json`);

  if (!fs.existsSync(filePath)) {
    const available = fs
      .readdirSync(ENVIRONMENT_DIR)
      .map((file) => path.basename(file, '.json'))
      .join(', ');
    throw new Error(`Unknown environment "${name}". Available environments: ${available}`);
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as EnvironmentFile;
};

const asBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
};

const asNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Resolution order, lowest priority first:
 *
 *   1. config/environments/<ENV>.json   - checked in, per environment defaults
 *   2. .env                             - developer machine, never committed
 *   3. real environment variables       - what CI and one-off runs use
 *
 * Keeping the precedence in one place means a step definition never has to ask
 * "which environment am I on" - it just reads the resolved object.
 */
export const resolve = (): Environment => {
  const name = process.env.ENV || DEFAULT_ENVIRONMENT;
  const file = readEnvironmentFile(name);

  return {
    name: file.name,
    baseUrl: (process.env.BASE_URL || file.baseUrl).replace(/\/$/, ''),
    apiBasePath: process.env.API_BASE_PATH || file.apiBasePath,
    timeouts: {
      step: asNumber(process.env.STEP_TIMEOUT, file.timeouts.step),
      expect: asNumber(process.env.EXPECT_TIMEOUT, file.timeouts.expect),
      action: asNumber(process.env.ACTION_TIMEOUT, file.timeouts.action),
      navigation: asNumber(process.env.NAVIGATION_TIMEOUT, file.timeouts.navigation)
    },
    execution: {
      browser: process.env.BROWSER || 'chromium',
      workers: asNumber(process.env.WORKERS, file.execution.workers),
      retries: asNumber(process.env.RETRY, file.execution.retries),
      headless: asBoolean(process.env.HEADLESS, file.execution.headless),
      slowMo: asNumber(process.env.SLOW_MO, file.execution.slowMo)
    },
    stability: {
      // Scenario level retries are the last resort, not the first: they are on
      // by default in CI where the shared demo instance is least predictable,
      // and off locally so a real failure is not hidden while developing.
      retryTagFilter: process.env.RETRY_TAG_FILTER || '',
      // 'off' | 'retained-on-failure' | 'on'. The default keeps the trace only
      // when a scenario fails, which is the only time anybody opens it.
      trace: process.env.TRACE || 'retained-on-failure',
      apiRetryAttempts: asNumber(process.env.API_RETRY_ATTEMPTS, 3),
      // 'off' | 'retain-on-failure' | 'on'. Videos are only finalised when the
      // browser context closes, so they are handled in the last After hook.
      video: process.env.VIDEO || 'retain-on-failure'
    },
    credentials: {
      adminUsername: process.env.ADMIN_USERNAME,
      adminPassword: process.env.ADMIN_PASSWORD,
      essPassword: process.env.ESS_PASSWORD || 'EssUser@2024'
    }
  };
};

// Resolved once per process. Cucumber forks a process per worker, so each worker
// gets its own copy and there is no shared mutable state to reason about.
const environment: Environment = resolve();

export default environment;
