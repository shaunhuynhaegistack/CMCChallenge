/**
 * Service level objectives, expressed once and imported by both scripts.
 *
 * These are calibrated against the public OrangeHRM demo instance as observed
 * from a GitHub Actions runner, not against a product SLO - nobody here controls
 * the target's capacity, its region, or who else is using it. A first pass with
 * numbers taken from a local run (p95 around 700 ms) failed on CI at p95 3.4 s
 * with a zero error rate: the instance was not broken, it was simply further
 * away and busier.
 *
 * They still mark a real boundary - the point at which a response is slow enough
 * for a user to notice - and a run that crosses them is reported and published.
 * On a system we owned, these numbers would come from the product's SLO instead.
 *
 * There is no p99 here on purpose. A run of this size produces a few hundred
 * requests, so the 99th percentile is decided by the single slowest response -
 * on a shared public instance that is somebody else's bad moment, not a property
 * of the system. Enforcing it produced exactly one failure: p99 crossed while
 * the error rate was zero and every p95 held. p95 over the same sample says
 * something; p99 is a coin flip.
 */
export const LOGIN_THRESHOLDS: Record<string, string[]> = {
  http_req_failed: ['rate<0.05'],
  http_req_duration: ['p(95)<5000'],
  'http_req_duration{endpoint:login_page}': ['p(95)<4000'],
  'http_req_duration{endpoint:validate}': ['p(95)<5000'],
  login_success_rate: ['rate>0.95'],
  checks: ['rate>0.95']
};

export const EMPLOYEE_THRESHOLDS: Record<string, string[]> = {
  http_req_failed: ['rate<0.05'],
  http_req_duration: ['p(95)<6000'],
  'http_req_duration{endpoint:create_employee}': ['p(95)<5000'],
  employee_create_success_rate: ['rate>0.95'],
  employee_create_duration: ['p(95)<5000'],
  checks: ['rate>0.95']
};

/**
 * The read path is expected to be quicker than a write, so it is held to a
 * tighter budget - a list that is as slow as a create means something is wrong
 * with the query, not with the load.
 */
export const SEARCH_THRESHOLDS: Record<string, string[]> = {
  http_req_failed: ['rate<0.05'],
  http_req_duration: ['p(95)<4000'],
  'http_req_duration{endpoint:employee_list}': ['p(95)<3500'],
  'http_req_duration{endpoint:employee_filter}': ['p(95)<3500'],
  employee_search_success_rate: ['rate>0.95'],
  checks: ['rate>0.95']
};

/**
 * The full write journey. The per-step thresholds matter more than the overall
 * one here: an iteration is four calls, so a single slow step disappears into an
 * aggregate but is exactly what a regression looks like.
 */
export const LIFECYCLE_THRESHOLDS: Record<string, string[]> = {
  http_req_failed: ['rate<0.05'],
  http_req_duration: ['p(95)<6000'],
  'http_req_duration{endpoint:lifecycle_create}': ['p(95)<5000'],
  'http_req_duration{endpoint:lifecycle_read}': ['p(95)<4000'],
  'http_req_duration{endpoint:lifecycle_update}': ['p(95)<5000'],
  'http_req_duration{endpoint:lifecycle_delete}': ['p(95)<5000'],
  lifecycle_success_rate: ['rate>0.95'],
  checks: ['rate>0.95']
};
