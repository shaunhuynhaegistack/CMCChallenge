import { sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { login } from '../lib/auth.ts';
import { LOGIN_THRESHOLDS } from '../lib/thresholds.ts';
import { scenarioFor, thresholdsFor, profileName, peakVus } from '../lib/profiles.ts';
import { buildSummary } from '../lib/report.ts';
import { logRunHeader, logRunFooter } from '../lib/log.ts';
import { BASE_URL } from '../lib/config.ts';

const loginSuccessRate = new Rate('login_success_rate');
const loginDuration = new Trend('login_duration', true);

/** What `setup` returns and `teardown` is handed back. */
interface SetupData {
  startedAt: number;
}

/** k6's end-of-test summary, as far as the report reads it. */
type K6Summary = Parameters<typeof buildSummary>[1];

export const options = {
  scenarios: scenarioFor('login_journey', 5),
  thresholds: thresholdsFor(LOGIN_THRESHOLDS),
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

export function setup(): SetupData {
  logRunHeader({
    name: 'login',
    baseUrl: BASE_URL,
    profile: profileName(),
    peakVus: peakVus(5)
  });
  return { startedAt: Date.now() };
}

export function teardown(data: SetupData): void {
  logRunFooter({ name: 'login', startedAt: data.startedAt });
}

export default function loginScenario(): void {
  const started = Date.now();
  const { ok } = login();

  loginSuccessRate.add(ok);
  loginDuration.add(Date.now() - started);

  sleep(Number(__ENV.THINK_TIME || 1));
}

export function handleSummary(data: K6Summary): Record<string, string> {
  return buildSummary('login', data);
}
