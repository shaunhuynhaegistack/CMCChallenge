# Performance testing (k6)

Four scripts, all pointed at the endpoints the UI itself uses. The brief asked
for two - login and employee creation; the other two are extra.

| Script | Journey | | Peak VUs |
| --- | --- | --- | ---: |
| `login.ts` | Fetch the login page for its CSRF token, then post the credentials | **Brief** | 5 |
| `employee-create.ts` | Authenticate, create an employee, delete it again | **Brief** | 3 |
| `employee-search.ts` | The read path: an unfiltered page and a filtered one, timed separately | Extra | 8 |
| `employee-lifecycle.ts` | The whole write journey: create -> read back -> update -> delete, each step timed on its own | Extra | 3 |

The single-endpoint scripts say how fast one call is. `employee-lifecycle.ts`
says whether the *journey* holds up - whether a read straight after a write is
slower, and whether a delete gets more expensive as the table grows.

## Load profiles

The same journey answers different questions under different load, so the shape
is a parameter rather than a copy of the script:

| `PERF_PROFILE` | Shape | Answers |
| --- | --- | --- |
| `smoke` | 1 VU, 20s | Is the script and the target alive? Runs on every pull request |
| `load` (default) | Ramp to peak, hold, ramp down | Does it hold at the expected load? |
| `stress` | Steps to 2x then 4x peak | *Which step* does it start to degrade at - a step profile shows that, a smooth ramp hides it |
| `spike` | Idle, 5x burst, idle | Does it recover after a sudden burst |
| `soak` | Half peak, long hold | Does it drift over time |

On `smoke` only the error rate and the checks are enforced: a handful of
iterations makes a percentile meaningless, and one slow response would fail a
threshold that is honest at load.

```bash
npm run perf                             # all four, load profile
npm run perf:smoke                       # all four, smoke profile
PERF_PROFILE=stress npm run perf:login   # find the knee
VUS=20 HOLD=5m npm run perf:search
```

## Thresholds

Defined once in `performance/lib/thresholds.ts` and imported by every script, so
the service level objective is not buried inside a scenario. The table below
covers the two the brief named; the other two are built the same way.

| Metric | Login | Employee creation |
| --- | --- | --- |
| `http_req_failed` | `rate<0.01` | `rate<0.02` |
| `http_req_duration` | `p(95)<5000` | `p(95)<6000` |
| Tagged endpoint | `login_page p(95)<1500`, `validate p(95)<2500` | `create_employee p(95)<2500` |
| Custom rate | `login_success_rate>0.99` | `employee_create_success_rate>0.98` |
| `checks` | `rate>0.99` | `rate>0.98` |

Requests are tagged (`endpoint:login_page`, `endpoint:validate`,
`endpoint:create_employee`, `endpoint:cleanup`) so a threshold can talk about one
call rather than the whole iteration. The cleanup delete is tagged but has no
threshold - it is housekeeping, not part of the measurement.

There is deliberately **no p99**. A run of this size produces a few hundred
requests, so the 99th percentile is decided by the single slowest response, and
on a shared public instance that is somebody else's bad moment rather than a
property of the system. Enforcing it produced exactly one failure - p99 crossed
while the error rate was zero and every p95 held.

The numbers are calibrated against the demo instance **as seen from a GitHub
Actions runner**, not against a product SLO - nobody here controls the target's
capacity, its region, or who else is using it. A first pass using numbers from a
local run (p95 around 700 ms) failed on CI at p95 3.4 s with a zero error rate:
the instance was not broken, it was simply further away and busier.

They still mark a real boundary - the point at which a response is slow enough
for a user to notice. On a system we owned, they would come from the product's
SLO instead.

## Reporting

`performance/lib/report.ts` replaces k6's default end-of-test summary with:

| Output | Contents |
| --- | --- |
| stdout | Pass/fail, request count, failure rate, p95, and any crossed threshold |
| `performance/results/<name>-summary.json` | Thresholds and metrics, machine readable |
| `performance/results/<name>-summary.html` | Self contained page, published as a CI artifact |
| `performance/results/<name>-raw.json` | The full k6 summary object |

It is written without the remote `jslib.k6.io` helpers so a run never depends on
fetching a script from the internet.

## Two things worth knowing about the target

* **The session cannot be shared between iterations.** k6 gives every iteration a
  fresh cookie jar, so a script that logs in only on the first iteration gets
  `401 Session expired` from the second one onwards. Every script authenticates
  per iteration, and the threshold that matters is scoped to the tagged request
  so the login cost does not distort it.
* **The load test cleans up after itself.** Every employee it creates is deleted
  in the same iteration. The instance is public and shared; leaving hundreds of
  `Perf...` records behind would be antisocial and would slowly skew the UI tests.

## CI

The `performance` job runs **after** the browser jobs rather than alongside them:
three engines running the whole scenario set each against the same shared
instance is load
in its own right, and a load test measured through someone else's traffic
measures nothing. That is not a theory - the first run that overlapped them
failed every error-rate threshold on all four scripts while passing every latency
one, which is exactly what contention looks like.

A pull request runs the `smoke` profile - one virtual user for twenty seconds,
enough to prove the scripts still parse and the target still answers. The full
`load` profile is reserved for pushes to `main` and for manual dispatch, because
a real load test against a shared public instance should not run on every
commit. Results are published as the `performance-results` artifact.

The job is `continue-on-error: true`: thresholds are evaluated and a breach is
visible in the log and the published summary, but the latency of a third party
demo instance is not something this repository can fix, so it does not turn the
pipeline red. On a system we owned this job would gate.
