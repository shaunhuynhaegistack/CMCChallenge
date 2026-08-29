import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { login } from '../lib/auth.ts';
import { LIFECYCLE_THRESHOLDS } from '../lib/thresholds.ts';
import { scenarioFor, thresholdsFor, profileName, peakVus } from '../lib/profiles.ts';
import { BASE_URL, PATHS } from '../lib/config.ts';
import { buildSummary } from '../lib/report.ts';
import { logRunHeader, logRunFooter } from '../lib/log.ts';

/**
 * The whole write path in one iteration: create, read back, update, delete.
 *
 * The single-endpoint scripts say how fast one call is. This one says whether
 * the *journey* holds up - whether a read straight after a write is slower, and
 * whether the cost of a delete grows as the table does. Each step is timed
 * separately so a regression can be attributed to the step that caused it.
 */
const createDuration = new Trend('lifecycle_create_duration', true);
const readDuration = new Trend('lifecycle_read_duration', true);
const updateDuration = new Trend('lifecycle_update_duration', true);
const deleteDuration = new Trend('lifecycle_delete_duration', true);
const lifecycleSuccessRate = new Rate('lifecycle_success_rate');
const completedLifecycles = new Counter('lifecycles_completed');

/** What `setup` returns and `teardown` is handed back. */
interface SetupData {
  startedAt: number;
}

/** k6's end-of-test summary, as far as the report reads it. */
type K6Summary = Parameters<typeof buildSummary>[1];

export const options = {
  scenarios: scenarioFor('employee_lifecycle_journey', 3),
  thresholds: thresholdsFor(LIFECYCLE_THRESHOLDS),
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

const json = { headers: { 'Content-Type': 'application/json' } };

// The employee id column holds 10 characters, and two VUs can reach this line in
// the same millisecond, so the VU and iteration numbers are part of the id.
const uniqueEmployee = () => {
  const stamp = Date.now().toString(36).slice(-5);
  const worker = `${__VU}`.padStart(2, '0').slice(-2);
  const iteration = `${__ITER}`.padStart(2, '0').slice(-2);
  return {
    firstName: `Life${stamp}${worker}`,
    middleName: '',
    lastName: `Cycle${iteration}`,
    employeeId: `L${stamp}${worker}${iteration}`
  };
};

export function setup(): SetupData {
  logRunHeader({
    name: 'employee lifecycle',
    baseUrl: BASE_URL,
    profile: profileName(),
    peakVus: peakVus(3)
  });
  return { startedAt: Date.now() };
}

export function teardown(data: SetupData): void {
  logRunFooter({ name: 'employee lifecycle', startedAt: data.startedAt });
}

export default function employeeLifecycleJourney(): void {
  const { ok } = login();
  if (!ok) {
    lifecycleSuccessRate.add(false);
    return;
  }

  const payload = uniqueEmployee();
  let empNumber: number | null = null;
  let succeeded = true;

  group('create', () => {
    const response = http.post(`${BASE_URL}${PATHS.employees}`, JSON.stringify(payload), {
      ...json,
      tags: { endpoint: 'lifecycle_create' }
    });

    createDuration.add(response.timings.duration);
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

    succeeded = succeeded && created;
    if (created) empNumber = Number(response.json('data.empNumber'));
  });

  if (!empNumber) {
    lifecycleSuccessRate.add(false);
    return;
  }

  group('read back', () => {
    const response = http.get(`${BASE_URL}${PATHS.employees}/${empNumber}/personal-details`, {
      tags: { endpoint: 'lifecycle_read' }
    });

    readDuration.add(response.timings.duration);
    succeeded =
      check(response, {
        'read returns 200': (res) => res.status === 200,
        'read returns what was written': (res) => {
          try {
            return res.json('data.employeeId') === payload.employeeId;
          } catch {
            return false;
          }
        }
      }) && succeeded;
  });

  group('update', () => {
    const response = http.put(
      `${BASE_URL}${PATHS.employees}/${empNumber}/personal-details`,
      JSON.stringify({
        ...payload,
        otherId: 'PERF-OTH',
        drivingLicenseNo: 'PERF-DL',
        drivingLicenseExpiredDate: null,
        gender: 1,
        maritalStatus: 'Single',
        birthday: '1990-01-01',
        nationalityId: null
      }),
      { ...json, tags: { endpoint: 'lifecycle_update' } }
    );

    updateDuration.add(response.timings.duration);
    succeeded = check(response, { 'update returns 200': (res) => res.status === 200 }) && succeeded;
  });

  group('delete', () => {
    const response = http.del(
      `${BASE_URL}${PATHS.employees}`,
      JSON.stringify({ ids: [empNumber] }),
      { ...json, tags: { endpoint: 'lifecycle_delete' } }
    );

    deleteDuration.add(response.timings.duration);
    succeeded = check(response, { 'delete returns 200': (res) => res.status === 200 }) && succeeded;
  });

  lifecycleSuccessRate.add(succeeded);
  if (succeeded) completedLifecycles.add(1);

  sleep(Number(__ENV.THINK_TIME || 1));
}

export function handleSummary(data: K6Summary): Record<string, string> {
  return buildSummary('employee-lifecycle', data);
}
