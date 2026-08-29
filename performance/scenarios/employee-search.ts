import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { login } from '../lib/auth.ts';
import { SEARCH_THRESHOLDS } from '../lib/thresholds.ts';
import { scenarioFor, thresholdsFor, profileName, peakVus } from '../lib/profiles.ts';
import { BASE_URL, PATHS } from '../lib/config.ts';
import { buildSummary } from '../lib/report.ts';
import { logRunHeader, logRunFooter } from '../lib/log.ts';

/**
 * The read path. Listing and filtering employees is what the application spends
 * most of its time doing - every screen in PIM starts with one of these calls -
 * so it is the endpoint most worth knowing the shape of under load.
 */
const searchSuccessRate = new Rate('employee_search_success_rate');
const listDuration = new Trend('employee_list_duration', true);
const filterDuration = new Trend('employee_filter_duration', true);

/** What `setup` returns and `teardown` is handed back. */
interface SetupData {
  startedAt: number;
}

/** k6's end-of-test summary, as far as the report reads it. */
type K6Summary = Parameters<typeof buildSummary>[1];

export const options = {
  scenarios: scenarioFor('employee_search_journey', 8),
  thresholds: thresholdsFor(SEARCH_THRESHOLDS),
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

// k6's runtime has no URLSearchParams, so the query is built by hand. Values
// here are all simple tokens; anything richer would need encodeURIComponent.
const listUrl = (params: Record<string, string | number>): string =>
  `${BASE_URL}${PATHS.employees}?${Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')}`;

export function setup(): SetupData {
  logRunHeader({
    name: 'employee search',
    baseUrl: BASE_URL,
    profile: profileName(),
    peakVus: peakVus(8)
  });
  return { startedAt: Date.now() };
}

export function teardown(data: SetupData): void {
  logRunFooter({ name: 'employee search', startedAt: data.startedAt });
}

export default function employeeSearchJourney(): void {
  const { ok } = login();
  if (!ok) {
    searchSuccessRate.add(false);
    return;
  }

  // Grouped so the summary separates an unfiltered page from a filtered one:
  // they hit the same endpoint but do very different work in the database.
  group('unfiltered page', () => {
    const response = http.get(
      listUrl({
        limit: 50,
        offset: 0,
        model: 'detailed',
        includeEmployees: 'onlyCurrent',
        sortField: 'employee.firstName',
        sortOrder: 'ASC'
      }),
      { tags: { endpoint: 'employee_list' } }
    );

    listDuration.add(response.timings.duration);
    searchSuccessRate.add(
      check(response, {
        'list returns 200': (res) => res.status === 200,
        'list returns a page of records': (res) => {
          try {
            return Array.isArray(res.json('data'));
          } catch {
            return false;
          }
        },
        'list reports a total': (res) => {
          try {
            return typeof res.json('meta.total') === 'number';
          } catch {
            return false;
          }
        }
      })
    );
  });

  group('filtered by name', () => {
    const response = http.get(
      listUrl({
        limit: 50,
        offset: 0,
        model: 'detailed',
        includeEmployees: 'onlyCurrent',
        nameOrId: 'a'
      }),
      { tags: { endpoint: 'employee_filter' } }
    );

    filterDuration.add(response.timings.duration);
    searchSuccessRate.add(check(response, { 'filter returns 200': (res) => res.status === 200 }));
  });

  sleep(Number(__ENV.THINK_TIME || 1));
}

export function handleSummary(data: K6Summary): Record<string, string> {
  return buildSummary('employee-search', data);
}
