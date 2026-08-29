#!/usr/bin/env node
/**
 * Preflight check for the application under test.
 *
 * The target is a public demo instance that anyone can use and that is reset
 * periodically. When it is down or has changed its credentials, a suite run
 * produces dozens of assertion failures that all say the wrong thing - the tests
 * look broken when the environment is. This asks the three questions that decide
 * whether a run is worth starting, and says which one failed.
 *
 * Exit codes
 *   0  the target is usable
 *   1  it is not
 *
 * A short blip is not an outage, so each question is retried before it counts as
 * a failure. `--soft` turns a failure into a warning and exit 0, which is what a
 * scheduled or post-merge run wants: nobody can act on a red badge caused by
 * somebody else's server. A pull request run does not use it, because merging
 * something that was never tested is worse than waiting.
 *
 *   npx ts-node tools/check-target.ts [--soft]
 */
import environment from '../lib/config/environment';

/** What one check hands to the next: the session cookie and the CSRF token. */
interface CheckState {
  detail?: string;
  cookie?: string;
  token?: string;
}

interface Check {
  name: string;
  run: (previous: CheckState) => Promise<CheckState & { detail: string }>;
}

const TIMEOUT_MS = Number(process.env.PREFLIGHT_TIMEOUT || 20000);
const ATTEMPTS = Number(process.env.PREFLIGHT_ATTEMPTS || 3);
const RETRY_DELAY_MS = Number(process.env.PREFLIGHT_RETRY_DELAY || 15000);
const SOFT = process.argv.includes('--soft');
const baseUrl = environment.baseUrl;

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async <T>(
  label: string,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } catch (error) {
    // An aborted fetch reports as a generic abort; say what actually happened.
    const failure = error as Error;
    throw new Error(
      failure.name === 'AbortError'
        ? `${label} did not answer within ${TIMEOUT_MS}ms`
        : failure.message
    );
  } finally {
    clearTimeout(timer);
  }
};

const checks: Check[] = [
  {
    name: 'the login page responds',
    run: async () => {
      const response = await withTimeout('The login page', (signal) =>
        fetch(`${baseUrl}/web/index.php/auth/login`, { signal, redirect: 'manual' })
      );
      if (!response.ok) throw new Error(`returned ${response.status}`);

      const body = await response.text();
      const token = body.match(/:token="&quot;([^&]+)&quot;"/);
      if (!token) throw new Error('did not contain a CSRF token - the login form has changed');

      return {
        detail: `${response.status}`,
        cookie: response.headers.get('set-cookie') || '',
        token: token[1]
      };
    }
  },
  {
    name: 'the configured credentials are accepted',
    run: async (previous: CheckState) => {
      const response = await withTimeout('The login endpoint', (signal) =>
        fetch(`${baseUrl}/web/index.php/auth/validate`, {
          method: 'POST',
          signal,
          redirect: 'manual',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: (previous.cookie || '').split(';')[0]
          },
          body: new URLSearchParams({
            _token: previous.token || '',
            username: environment.credentials.adminUsername || 'Admin',
            password: environment.credentials.adminPassword || 'admin123'
          })
        })
      );

      const location = response.headers.get('location') || '';
      if (!location.includes('/dashboard/index')) {
        throw new Error(
          `sign in did not reach the dashboard (status ${response.status}, location "${location}"). ` +
            'Set ADMIN_USERNAME and ADMIN_PASSWORD if the demo credentials have changed.'
        );
      }

      return { detail: 'signed in', cookie: response.headers.get('set-cookie') || previous.cookie };
    }
  },
  {
    name: 'the employees API answers',
    run: async (previous: CheckState) => {
      const response = await withTimeout('The employees API', (signal) =>
        fetch(`${baseUrl}/web/index.php/api/v2/pim/employees?limit=1&offset=0`, {
          signal,
          headers: { Cookie: (previous.cookie || '').split(';')[0] }
        })
      );
      if (!response.ok) throw new Error(`returned ${response.status}`);

      const body = (await response.json()) as { meta: { total: number } };
      return { detail: `${body.meta.total} employees on the instance`, cookie: previous.cookie };
    }
  }
];

const runOnce = async (): Promise<void> => {
  let carried: CheckState = {};

  for (const check of checks) {
    const result = await check.run(carried);
    carried = { ...carried, ...result };
    console.log(`  ok    ${check.name} - ${result.detail}`);
  }
};

(async () => {
  console.log(`Checking ${baseUrl}`);

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      await runOnce();
      console.log('Target is healthy.');
      return;
    } catch (error) {
      console.error(`  FAIL  attempt ${attempt}/${ATTEMPTS}: ${(error as Error).message}`);
      if (attempt < ATTEMPTS) await pause(RETRY_DELAY_MS);
    }
  }

  const summary =
    'The application under test is not usable right now, so a suite run would ' +
    'produce failures that say nothing about the tests.';

  if (SOFT) {
    // A GitHub Actions warning annotation, and a clean exit: an outage on a
    // third party instance is not a defect in this repository.
    console.log(`::warning::${summary} The suite was skipped.`);
    console.log(summary);
    return;
  }

  console.error(`\n${summary} Try again shortly, or point BASE_URL at an instance you control.`);
  process.exit(1);
})();
