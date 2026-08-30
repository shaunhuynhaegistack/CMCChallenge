# Test stability and reliability

## Retry logic

Retries are configured per environment, not per scenario:

| Environment | `retries` | Why |
| --- | --- | --- |
| `demo` (local default) | 1 | The target is shared and public, so one retry separates a broken test from someone else's traffic - and the retry is still reported |
| `ci` | 2 | The demo instance is shared and public, so some failures are genuinely environmental |

`RETRY_TAG_FILTER` narrows retries to a tag expression - set it to `@flaky` to
retry only the scenarios that are known to depend on the shared instance and let
everything else fail on the first attempt.

There is a second, much narrower retry inside `lib/api/ApiClient`: a `429`, `500`,
`502`, `503` or `504` is retried with a linear backoff. Those statuses are infrastructure
noise rather than test results. Every other status is handed to the assertion
untouched, so a genuine `403` or `422` still fails the scenario immediately.

**Retries are a safety net, not a fix.** Every retry is recorded, and the flaky
detector below is what turns "it passed on the second go" into a work item.

## Smart waiting

The suite contains no `waitForTimeout` and no `sleep` in a test path. Three
mechanisms, in order of preference:

1. **Playwright auto-waiting.** Every locator action waits for the element to be
   attached, visible, stable and able to receive events.
2. **Response waits.** `BasePage.clickAndWaitForApi` resolves only once the fetch
   that the click triggered has returned. OrangeHRM keeps the previous rows on
   screen while a filtered search is in flight, so without this the assertion
   reads the unfiltered list. This was the first real flaky failure this suite
   produced, and it failed roughly one run in three before the fix.
3. **State polling.** `PersonalDetailsPage.waitUntilLoaded` waits until the form
   has actually been populated by its own XHR. The page renders empty inputs
   first and overwrites them when the response lands, so anything typed before
   that is silently discarded - a save would then appear to succeed while storing
   nothing. `lib/BasePage.ts` provides `waitUntil` and `retryAsync` for the
   cases the first two cannot express.

## Evidence on failure

Captured in `hooks/hooks.ts`, written to `reports/<browser>/`:

| Artifact | When | Where |
| --- | --- | --- |
| Full page screenshot | Every failed attempt | `screenshots/` and attached inside the HTML report |
| Playwright trace | Every failed attempt | `traces/` |
| Console log line | Every failure, marked when a retry is still pending | Job log |

The trace is the important one on CI: `npx playwright show-trace <file>.zip`
replays the DOM, network and console for every action, which usually removes the
need to reproduce a CI-only failure locally. Tracing runs for every scenario and
is discarded on success (`TRACE=off` disables it, `TRACE=on` keeps every trace).

## Flaky test detection

`npm run flaky:check` (`tools/flaky-detector.ts`).

Cucumber's JSON report only keeps the **final** attempt of a retried scenario, so
it cannot be used to spot flakiness. The detector reads the message stream
(`reports/<browser>/cucumber-messages.ndjson`) instead, which records every
`testCaseStarted` together with its attempt number. A scenario that ran more than
once was retried; if the last attempt passed, it recovered - and that is the
definition of flaky used here.

For each such scenario the tool reports the number of attempts, the final status,
the first failure message, and how many recorded runs that scenario has flaked in.
The running count is kept in `reports/flaky-history.json`. A fresh runner starts
with nothing, so CI restores the file from the actions cache before the detector
runs and saves it again afterwards, per browser. That is what lets the counts
accumulate and separates one bad night on a shared demo instance from a test
that is genuinely unreliable; the file is also published as the
`flaky-history-<browser>` artifact so the counts can be read without a checkout.

CI runs the detector after every browser job and writes the result into the run
summary. `--fail-on-flaky` makes it exit non-zero, which is worth enabling once a
suite is expected to be clean.

## Mitigation strategy

The order matters - retries are last, not first.

1. **Quarantine, do not ignore.** A scenario that flakes repeatedly gets `@flaky`.
   The blocking run then excludes it with `--tags "not @flaky"` and it is run
   separately without gating the merge, so it keeps producing data instead of
   rotting. Nothing carries the tag today, so no profile hard-codes the
   exclusion - `npm run check:tags` names every scenario that acquires it.
2. **Classify the cause before touching the test.** The trace and the first
   failure message usually place it in one of four buckets:
   - *timing* - the assertion ran before the application settled. Fixed with a
     response or state wait, never with a longer timeout.
   - *test data* - two workers collided. Fixed in `test-data/employee-factory.ts`,
     which builds ids from a timestamp plus the worker pid.
   - *state leakage* - a scenario depended on what another one left behind. Each
     scenario here gets a fresh browser context and deletes its own data in an
     After hook, so this cannot happen by construction.
   - *environment* - the shared instance was slow or rate limited. This is the
     only bucket a retry legitimately covers.
3. **Fix the root cause, then remove the quarantine tag.** The fix belongs in the
   page object or the wait helper so every scenario benefits, not in one step.
4. **Watch the trend.** `reports/flaky-history.json` shows whether a scenario is
   getting better or worse. A scenario that keeps reappearing is deleted or
   rewritten - a test nobody trusts is worse than no test.

## Localization drift, and where it is repaired

The display language and the date format are instance-wide settings on a public
instance anyone can change, and every control here is addressed by the label a
user reads. Repair therefore happens at three points rather than one:

| Point | What it can use | When it runs |
| --- | --- | --- |
| `tools/run-suite.ts` | An admin sign-in over plain fetch | Once, before the suite starts |
| `signIn` / `signInAsInSeparateSession` in `support/actions.ts` | The session that has just been created | After every sign-in, including the second session the role scenarios open |
| `ensureAuthScreenLanguage` in `support/actions.ts` | Only what is on screen - a signed-out scenario has no session | On the login and password reset screens, comparing the submit button's own label and repairing over the API only when it has moved |

The third exists because the unauthenticated scenarios assert the words the
product renders and are the only ones the second point cannot reach.

## Known instability in this application

The demo instance is public, shared and periodically reset. Observed while
building this suite:

* Occasional slow responses under parallel load, which is why the `ci` profile
  uses longer timeouts and two retries.
* Employee data created by other people appears and disappears, so no scenario
  asserts on a total record count. Every assertion is scoped to data the scenario
  created itself.
* The employee id column is limited to 10 characters. The API rejects a longer
  value with `422` while the UI silently truncates it, which produced a confusing
  first failure - the UI reported success and the follow-up search found nothing.
