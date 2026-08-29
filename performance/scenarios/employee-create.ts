import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { login } from '../lib/auth.ts';
import { EMPLOYEE_THRESHOLDS } from '../lib/thresholds.ts';
import { scenarioFor, thresholdsFor, profileName, peakVus } from '../lib/profiles.ts';
import { BASE_URL, PATHS } from '../lib/config.ts';
import { buildSummary } from '../lib/report.ts';
import { logRunHeader, logRunFooter } from '../lib/log.ts';

const createSuccessRate = new Rate('employee_create_success_rate');
const createDuration = new Trend('employee_create_duration', true);
const createdEmployees = new Counter('employees_created');
const cleanedEmployees = new Counter('employees_deleted');

/** What `setup` returns and `teardown` is handed back. */
interface SetupData {
  startedAt: number;
}

/** k6's end-of-test summary, as far as the report reads it. */
type K6Summary = Parameters<typeof buildSummary>[1];

export const options = {
  scenarios: scenarioFor('employee_create_journey', 3),
  thresholds: thresholdsFor(EMPLOYEE_THRESHOLDS),
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

const uniqueEmployee = () => {
  const suffix = `${Date.now()}`.slice(-6) + `${__VU}${__ITER}`.slice(0, 3);
  return {
    firstName: `Perf${suffix}`,
    middleName: '',
    lastName: `Load${suffix.slice(-4)}`,
    // The column is limited to 10 characters.
    employeeId: `PF${suffix}`.slice(0, 10)
  };
};

/**
 * k6 gives every iteration a fresh cookie jar, so the session cannot be shared
 * between iterations - each one authenticates first. That is also the honest
 * shape of the journey being measured: sign in, then create an employee. The
 * threshold that matters is scoped to the tagged `create_employee` request, so
 * the login cost does not distort it.
 */
export function setup(): SetupData {
  logRunHeader({
    name: 'employee creation',
    baseUrl: BASE_URL,
    profile: profileName(),
    peakVus: peakVus(3)
  });
  return { startedAt: Date.now() };
}

export function teardown(data: SetupData): void {
  logRunFooter({ name: 'employee creation', startedAt: data.startedAt });
}

export default function createEmployeeScenario(): void {
  const { ok } = login();
  if (!ok) {
    createSuccessRate.add(false);
    return;
  }

  const payload = uniqueEmployee();
  const response = http.post(`${BASE_URL}${PATHS.employees}`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'create_employee' }
  });

  const created = check(response, {
    'create returns 200': (res) => res.status === 200,
    'create returns an employee number': (res) => {
      try {
        return Boolean(res.json('data.empNumber'));
      } catch {
        return false;
      }
    }
  });

  createSuccessRate.add(created);
  createDuration.add(response.timings.duration);

  if (created) {
    createdEmployees.add(1);

    // The instance is shared, so the load test cleans up after itself. The
    // delete is untagged and excluded from the thresholds - it is housekeeping,
    // not part of the measurement.
    const empNumber = response.json('data.empNumber');
    const removal = http.del(
      `${BASE_URL}${PATHS.employees}`,
      JSON.stringify({ ids: [empNumber] }),
      { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'cleanup' } }
    );
    if (removal.status === 200) cleanedEmployees.add(1);
  }

  sleep(Number(__ENV.THINK_TIME || 1));
}

export function handleSummary(data: K6Summary): Record<string, string> {
  return buildSummary('employee-create', data);
}
