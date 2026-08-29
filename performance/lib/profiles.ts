/**
 * Load profiles.
 *
 * The same script has to answer different questions - "does it work at all",
 * "does it hold at the expected load", "where does it break", "what happens on a
 * sudden burst" - and those differ only in the shape of the load. Keeping the
 * shapes here means a scenario script describes the journey and nothing else,
 * and a run is selected with one environment variable.
 *
 *   PERF_PROFILE=smoke   1 VU, seconds        - is the script and the target alive
 *   PERF_PROFILE=load    ramp to VUS, hold    - the expected steady state (default)
 *   PERF_PROFILE=stress  step up past VUS     - where the target starts to degrade
 *   PERF_PROFILE=spike   idle, burst, idle    - recovery after a sudden burst
 *   PERF_PROFILE=soak    low load, long hold  - drift over time
 */
import { asInt } from './config.ts';

const PROFILE = (__ENV.PERF_PROFILE || 'load').toLowerCase();

const vus = (fallback: number): number => asInt(__ENV.VUS, fallback);

const shapes: Record<string, (peak: number) => Record<string, unknown>> = {
  smoke: (peak) => ({
    executor: 'constant-vus',
    vus: 1,
    duration: __ENV.HOLD || '20s',
    tags: { profile: 'smoke', peak_vus: String(Math.min(1, peak)) }
  }),

  load: (peak) => ({
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: __ENV.RAMP_UP || '30s', target: peak },
      { duration: __ENV.HOLD || '1m', target: peak },
      { duration: __ENV.RAMP_DOWN || '15s', target: 0 }
    ],
    gracefulRampDown: '10s',
    tags: { profile: 'load' }
  }),

  // Steps rather than a single ramp: a step profile shows *which* step the
  // response times start to climb at, which a smooth ramp hides.
  stress: (peak) => ({
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '20s', target: peak },
      { duration: '30s', target: peak },
      { duration: '20s', target: peak * 2 },
      { duration: '30s', target: peak * 2 },
      { duration: '20s', target: peak * 4 },
      { duration: '30s', target: peak * 4 },
      { duration: '20s', target: 0 }
    ],
    gracefulRampDown: '15s',
    tags: { profile: 'stress' }
  }),

  spike: (peak) => ({
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '15s', target: peak },
      { duration: '10s', target: peak * 5 },
      { duration: '20s', target: peak * 5 },
      { duration: '10s', target: peak },
      { duration: '20s', target: peak },
      { duration: '10s', target: 0 }
    ],
    gracefulRampDown: '15s',
    tags: { profile: 'spike' }
  }),

  soak: (peak) => ({
    executor: 'constant-vus',
    vus: Math.max(1, Math.round(peak / 2)),
    duration: __ENV.HOLD || '30m',
    tags: { profile: 'soak' }
  })
};

/**
 * `name` is the k6 scenario name that appears in the output; `peak` is this
 * journey's default peak VUs, which VUS overrides.
 */
export function scenarioFor(name: string, peak: number): Record<string, unknown> {
  const shape = shapes[PROFILE] || shapes.load;
  return { [name]: shape(vus(peak)) };
}

export const profileName = (): string => PROFILE;

/**
 * The peak concurrency a run will actually reach, which is what a reader wants
 * in the header - the profile multiplies the script's default, and VUS overrides
 * it, so neither number on its own tells the truth.
 */
export const peakVus = (fallback: number): number => {
  const base = vus(fallback);
  if (PROFILE === 'smoke') return 1;
  if (PROFILE === 'stress') return base * 4;
  if (PROFILE === 'spike') return base * 5;
  if (PROFILE === 'soak') return Math.max(1, Math.round(base / 2));
  return base;
};

/**
 * A smoke run is a handful of iterations, so a percentile over it means nothing
 * and a single slow response would fail a threshold that is meaningful at load.
 * Only the error rate and the checks are enforced there.
 */
export function thresholdsFor(full: Record<string, string[]>): Record<string, string[]> {
  if (PROFILE !== 'smoke') return full;

  return Object.fromEntries(
    Object.entries(full).filter(([metric]) => metric === 'checks' || metric === 'http_req_failed')
  );
}
