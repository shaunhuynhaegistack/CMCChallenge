# OrangeHRM QA Automation

End-to-end automation for the OrangeHRM employee lifecycle: **Playwright + Cucumber (BDD)**
in TypeScript, with a CI pipeline, a merge gate, k6 load tests and Slack/Teams reporting.

| | |
| --- | --- |
| Application under test | <https://opensource-demo.orangehrmlive.com/> |
| Repository visibility | Public — the brief allows it (*"GitHub link (public or shared access)"*), and see [why](#why-this-repository-is-public) |
| Latest test report | Published to GitHub Pages while the repository is public; otherwise the `html-report` artifact on any [workflow run](https://github.com/shaunhuynhaegistack/CMCChallenge/actions) |
| Committed snapshot of a run | [`docs/sample-run/`](docs/sample-run) — 102 scenarios (34 × 3 engines), all passing |
| Scenarios | **67** across 11 feature files, on **3 engines in parallel**: Chromium, Firefox, WebKit — plus 6 localization scenarios that must run alone, and 1 deliberate failure |
| Framework unit tests | 15 |
| Language | TypeScript — [no JavaScript file in the repository](#typescript) |

---

## Contents

1. [Quick start](#quick-start)
2. [Reviewing this in five minutes](#reviewing-this-in-five-minutes)
3. [Test coverage — every scenario, and which are extra](#test-coverage)
4. [What the assignment asked for, and where it is](#what-the-assignment-asked-for-and-where-it-is)
5. [Beyond the brief](#beyond-the-brief)
6. [TypeScript](#typescript)
7. [Repository structure](#repository-structure)
8. [Configuration](#configuration)
9. [Running tests](#running-tests)
10. [Reports and artifacts](#reports-and-artifacts)
11. [Slack / Teams — one secret and it works](#slack--teams--one-secret-and-it-works)
12. [CI/CD and the merge gate](#cicd-and-the-merge-gate)
13. [Stability](#stability)
14. [Performance](#performance)
15. [Known defects this suite found](#known-defects-this-suite-found)
16. [Notes on the assignment](#notes-on-the-assignment)
17. [Design decisions](#design-decisions)

---

## Quick start

```bash
npm ci
npm run install:browsers
npm test                 # 67 scenarios on Chromium
npm run report           # build the HTML report
open reports/chromium/html-report/index.html
```

Node 22 (`.nvmrc` pins it). `engines` mirrors Cucumber's own supported range,
`22 || 24 || >=26` — it refuses to start outside that, so anything wider here
would be a lie. Nothing else is needed to run against the
public demo. Every script works on macOS, Linux and Windows.

For the k6 load tests only — **0.57 or newer**, because the load scripts are
TypeScript and that is the release k6 learned to read it in. CI pins 2.2.0:

```bash
brew install k6                      # macOS
winget install k6 --source winget    # Windows
# Linux: https://grafana.com/docs/k6/latest/set-up/install-k6/
```

### If a run fails on your machine

The target is a **public demo instance anyone can use, which resets periodically**,
so an occasional failure says more about the instance than about the suite:

```bash
npm run check:target     # is the instance actually up, and are the credentials still good?
npm run flaky:check      # did it fail once and pass on the retry?
ENV=ci npm test          # longer timeouts and two retries, the way CI runs it
npx playwright show-trace reports/chromium/traces/<file>.zip
```

`npm run check:target` is the one to run first. It asks the three questions that
decide whether a run is worth starting — does the login page respond, are the
credentials accepted, does the employees API answer — and says which one failed.
CI runs it before the suite for the same reason: one clear line beats twenty
minutes of assertion failures that all blame the tests for an environment
problem.

The `demo` profile retries a scenario once. The target is shared and public, so a
single blip is not news — and nothing is hidden by it: every retry is recorded in
the message stream and reported by `npm run flaky:check`.

Every failed scenario leaves a screenshot, a video and a Playwright trace under
`reports/<browser>/`.

---

## Why this repository is public

The brief allows either: *"GitHub link (public or shared access)"*. It is public
for a practical reason worth writing down, because it is the kind of thing that
bites a pipeline quietly.

It was briefly made private. Within one run every job started failing with:

```
Failed to CreateArtifact: Artifact storage quota has been hit.
```

The tests were fine - 34/34 on all three engines - but on a private repository
every artifact counts against the account's storage quota, and this pipeline
publishes a lot of them: raw results with videos and traces, the HTML report, the
k6 summaries, the failure showcase. They had reached 1.66 GB. Deleting them does
not help immediately either; GitHub recalculates usage every six to twelve hours.

Public repositories get that storage for free, so the pipeline keeps working and
GitHub Pages keeps serving the report. Two things were changed alongside, because
neither should have depended on visibility in the first place:

* retention is now days rather than a month, and the duplicate zipped archive is
  only built when a Slack bot is configured to receive it
* **an upload can no longer fail a test job.** A job's verdict is whether the
  tests passed, not whether the artifact service accepted a file

The named reviewers also hold direct access, so the *"shared access"* half of the
brief is satisfied regardless of visibility.

---

## Reviewing this in five minutes

| Look at | Why |
| --- | --- |
| The `html-report` artifact on the latest [workflow run](https://github.com/shaunhuynhaegistack/CMCChallenge/actions) | The latest run, all three engines, plus k6 and the failure showcase — without cloning. Also served on GitHub Pages while the repository is public |
| [Test coverage](#test-coverage) | All 67 scenarios, and which go beyond the brief |
| [`features/employee-lifecycle.feature`](features/employee-lifecycle.feature) | The headline scenario: create in the UI → verify by API → update → verify → delete → verify |
| [`lib/BasePage.ts`](lib/BasePage.ts) | The locator strategy — why a UI change is one file, not fifteen |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | The pipeline and the two halves of the merge gate |
| [Known defects this suite found](#known-defects-this-suite-found) | Real defects in OrangeHRM, and five in this framework its own tests caught |
| [Notes on the assignment](#notes-on-the-assignment) | Where the brief is ambiguous, and what was decided instead |
| [The pull requests](https://github.com/shaunhuynhaegistack/CMCChallenge/pulls?q=is%3Apr) | One per part of the assignment, each gated on CI |

---

## Test coverage

**67 scenarios** across 11 feature files in the normal profile, plus 6 that
change instance-wide settings and therefore run in their own, plus the one
deliberate failure that runs in neither. Thirteen files in total. The brief named six things for Part 1; those are marked
**Brief**. Everything marked **Extra** is coverage added on top — the brief did
not ask for it.

### `features/authentication.feature` — `@auth`

| # | Scenario | Tags | |
| --- | --- | --- | --- |
| 1 | An administrator signs in successfully | `@smoke @positive` | **Brief** |
| 2 | Sign in is rejected for `invalidPassword` | `@regression @negative` | **Brief** |
| 3 | Sign in is rejected for `unknownUser` | `@regression @negative` | **Brief** |
| 4 | Submitting an empty form shows field level validation | `@regression @negative` | Extra |
| 5 | Signing out returns the user to the login page | `@smoke @positive` | Extra |
| 6 | The session is invalidated after signing out | `@regression @negative` | Extra |
| 7 | The login page shows the branding and hides the password | `@regression @positive` | Extra |
| 8 | The password reset page is reachable from the login page | `@regression @negative` | Extra |
| 9 | Signing in without a password is rejected client-side | `@regression @negative` | Extra |
| 10 | Sign in is rejected for `wrongCasePassword` | `@regression @negative` | Extra |
| 11 | Sign in is rejected for `injectionAttempt` | `@regression @negative` | Extra |
| 12 | Sign in is rejected for `overlongUsername` | `@regression @negative` | Extra |
| 13 | The rejection message is the same whether or not the account exists | `@regression @security` | Extra |
| 14 | The user name is not case sensitive | `@regression @positive` | Extra |
| 15 | Surrounding whitespace in the user name is not trimmed | `@regression @negative` | Extra |
| 16 | The session cookie is not readable from script | `@regression @security` | Extra |
| 17 | A signed out session cannot be restored with the back button | `@regression @negative` | Extra |

Scenarios 2, 3 and 10 to 12 are one `Scenario Outline` with five examples.

**13 is the one worth reading.** Two different reasons to refuse a sign-in — no
such account, and a real account with the wrong secret — must produce one
message. A screen that distinguishes them answers *"does this account exist?"*
for anybody willing to ask twice.

### `features/employee-lifecycle.feature` — `@pim`

| # | Scenario | Tags | |
| --- | --- | --- | --- |
| 10 | **Full lifecycle**: create in UI → API check → update → API check → delete → API check | `@smoke @e2e @api` | **Brief** (creation, update, deletion, API verification) |
| 11 | Mandatory fields are enforced when adding an employee | `@regression @negative` | Extra |
| 12 | An employee created through the API is visible in the UI | `@regression @api` | Extra |
| 13 | Personal details changed through the API are shown in the UI | `@regression @api` | Extra |
| 14 | The employee list can be filtered by employee name | `@regression` | Extra |
| 15 | An employee id that is already in use is rejected | `@regression @negative @api` | Extra |
| 16 | Resetting the filter brings the full employee list back | `@regression` | Extra |
| 17 | The record count on screen matches the API for the same filter | `@regression @api` | Extra |
| 18 | Several employees can be removed in one bulk delete | `@regression` | Extra |
| 19 | Contact details saved in the UI are returned by the API | `@regression @api` | Extra |

### `features/role-based-access.feature` — `@rbac`

| # | Scenario | Tags | |
| --- | --- | --- | --- |
| 20 | An administrator sees every module | `@regression` | **Brief** (role-based validation) |
| 21 | An ESS user cannot reach the administration modules (UI menu, admin page `403`, admin API `403`) | `@regression @e2e @api` | **Brief** |
| 22 | An anonymous caller cannot read employee data (`401`) | `@regression @api @negative` | Extra |
| 23 | An ESS user can read the directory but not change it (`200` read, `403` create) | `@regression @api` | Extra |

### `features/employee-api.feature` — `@pim`, API only

| # | Scenario | Tags | |
| --- | --- | --- | --- |
| 24 | The whole employee lifecycle through the API alone | `@regression @api` | Extra |
| 25 | Creating an employee without a `firstName` is rejected | `@regression @negative @api` | Extra |
| 26 | Creating an employee without a `lastName` is rejected | `@regression @negative @api` | Extra |
| 27 | The employee list endpoint paginates | `@regression @api` | Extra |

### `features/dashboard.feature` — `@dashboard`

| # | Scenario | Tags | |
| --- | --- | --- | --- |
| 28 | The dashboard presents its widgets | `@smoke` | Extra |
| 29 | The modules the brief names open from the side menu | `@regression` | Extra |

### `features/recruitment.feature` — `@recruitment` (all Extra)

| # | Scenario | Tags | |
| --- | --- | --- | --- |
| 30 | The candidate list opens with its filters | `@smoke` | Extra |
| 31 | A candidate created through the API appears in the candidate list | `@regression @api` | Extra |
| 32 | A candidate without an email address is rejected | `@regression @negative @api` | Extra |

### `features/leave.feature` — `@leave` (all Extra)

| # | Scenario | Tags | |
| --- | --- | --- | --- |
| 33 | The leave list opens for an administrator | `@smoke` | Extra |
| 34 | The leave types offered on screen are the ones the API reports | `@regression @api` | Extra |

Scenario 34 is the kind of defect that is easy to ship and hard to notice: a
dropdown that has drifted from the data behind it, so a user picks something the
system no longer has, or never sees something it does.

### `features/password-reset.feature` — `@auth @password-reset` (all Extra)

| # | Scenario | Tags | |
| --- | --- | --- | --- |
| 35 | The reset screen offers a username, a submit and a way back | `@smoke @positive` | Extra |
| 36 | A reset cannot be requested without a username | `@regression @negative` | Extra |
| 37 | Cancelling returns to the login page | `@regression @positive` | Extra |
| 38 | The reset screen is reachable from the login page and back again | `@regression @positive` | Extra |

These stop short of submitting a reset. This instance throttles the request and
then silently stops answering, so a scenario that depends on one being accepted
is unstable for a reason that has nothing to do with the code. The property a
submission would have proved is asserted by scenario 13 instead.

### `features/admin-user-management.feature` — `@admin` (all Extra)

| # | Scenario | Tags | |
| --- | --- | --- | --- |
| 39 | The user list opens with its filters and its records | `@smoke` | Extra |
| 40 | An account created through the API is found by its user name | `@regression @api` | Extra |
| 41 | A user name that does not exist returns nothing rather than everything | `@regression` | Extra |
| 42 | Resetting the filter brings the full list back | `@regression` | Extra |
| 43 | A duplicate user name is rejected | `@regression @api` | Extra |
| 44 | An account deleted through the UI is gone from the API | `@regression @api` | Extra |

Scenario 41 is what found the response race described under
[known defects](#known-defects-this-suite-found): it reported ten rows while the
same query returned nothing from the API.

### `features/my-info.feature` — `@myinfo` (all Extra)

| # | Scenario | Tags | |
| --- | --- | --- | --- |
| 45 | My Info opens the signed in user's own record | `@smoke` | Extra |
| 46 | My Info offers the sections of a personnel record | `@regression` | Extra |
| 47 | My Info and the API describe the same person | `@regression @api` | Extra |

Read-only on purpose. The administrator's record on a shared instance belongs to
whoever else is using it, and a suite that edits it to prove a point leaves that
change behind for everybody.

### `features/module-navigation.feature` — `@navigation` (all Extra)

| # | Scenario | Tags | |
| --- | --- | --- | --- |
| 48-56 | Each of nine modules is reachable and renders | `@smoke` | Extra |
| 57 | Maintenance asks for the administrator password again | `@regression @security` | Extra |
| 58 | The side menu offers every module this role is entitled to | `@regression` | Extra |
| 59 | A module route answers with a page rather than an error | `@regression` | Extra |

The brief names five modules; this instance ships twelve, and a suite that only
ever visits five cannot say whether the rest are reachable at all — which is the
first thing that breaks when a deployment goes wrong.

**Maintenance gets a scenario of its own.** Its menu entry lands straight on
Purge Records, which permanently deletes employee data on an instance other
people are using. The product asks for the administrator password again before
it will do anything, and the suite asserts that prompt and deliberately does not
answer it.

### `features/localization.feature` — `@localization`, its own profile

**Not counted in the 67**, because these change instance-wide settings and
cannot run beside anything else. Six scenarios, one worker, each restoring what
it found even when it fails.

| # | Scenario | Tags | |
| --- | --- | --- | --- |
| L1 | The language decides the label on every control | `@smoke @language` | Extra |
| L2 | Changing the language does not change what the API returns | `@regression @language @api` | Extra |
| L3-L5 | A stored date is rendered in the instance date format | `@regression @date` | Extra |
| L6 | The date format is presentation only — the API still stores ISO | `@regression @date @api` | Extra |

L2 and L6 assert what does *not* move: the record and its ISO date are the same
whatever the screen is showing. That is the line between presentation and data,
and it is the assertion that makes the other four worth having.

### `features/failure-showcase.feature` — `@showcase @demo-failure`

**Not part of the assignment, and not counted in the 67.** One scenario that
fails on purpose, so a reviewer can see what a failure looks like — the report
entry, the screenshot, the video and the trace — without waiting for a real one.

It can never affect a normal run: the browser profiles carry
`tags: 'not @demo-failure'`, and a profile's tag expression is ANDed with any
`--tags` on the command line, so it is unreachable except through its own
`showcase` profile. In CI it runs in a separate `continue-on-error` job and
publishes to [the site](https://shaunhuynhaegistack.github.io/CMCChallenge/)
under *What a failure looks like*.

```bash
npm run test:failure-demo      # run it locally
```

### Framework unit tests — `lib/unit/`, 15 tests

Not scenarios, but part of the coverage: the data factory, the environment
resolver, the localized date formatter and the report aggregator. Two of them
found real defects in this framework — see
[below](#and-two-in-this-framework-found-by-its-own-unit-tests).

---

## What the assignment asked for, and where it is

### Part 1 — Advanced end-to-end automation

| Requirement | Where |
| --- | --- |
| Authentication | `features/authentication.feature` (17 scenarios), extended with `features/password-reset.feature` — the two screens an unauthenticated user can reach |
| Employee creation | `features/employee-lifecycle.feature` |
| Role based validation | `features/role-based-access.feature` — Admin vs a provisioned ESS account — and `features/admin-user-management.feature` for the screen those accounts are administered from |
| Employee update | `features/employee-lifecycle.feature` — personal details and contact details |
| API level verification | `lib/api/ApiClient.ts`, asserted after every mutation |
| Employee deletion | `features/employee-lifecycle.feature` — single and bulk |

The brief asks for six things. The scenarios above cover them; everything marked
**Extra** in the [coverage table](#test-coverage) is on top of that, and the
reason each one is there is given beside it rather than left to be guessed.

### Part 2 — Framework design and engineering

| Requirement | How |
| --- | --- |
| Page Object Model | One class per screen extending `BasePage`, shared components for the menu and top bar, built lazily per page by `page-objects/index.ts`. Page objects expose actions and queries and **never assert** |
| Clean, scalable folder structure | See [below](#repository-structure) — adding a screen touches the page object, the registry and the feature, nothing else |
| Environment based configuration | `config/environments/*.json` layered with `.env` and real environment variables in `lib/config/environment.ts` — the only place in the framework that reads `process.env` for configuration |
| Reusable utilities | `BasePage.clickAndWaitForApi`, `lib/BasePage.ts`, `lib/utils/data-helper.ts`, `test-data/employee-factory.ts`, `lib/utils/date-format.ts`, `lib/BasePage.ts`, `lib/api/ApiClient.ts` |

### Part 3 — CI/CD pipeline integration

| Requirement | How |
| --- | --- |
| Install dependencies | `npm ci` plus a cached Playwright browser install |
| Execute automated tests | One job per browser engine, all three in parallel |
| Generate reports | An aggregation job builds the HTML report from every engine's results |
| Publish artifacts | `results-<browser>`, `html-report`, `performance-results`, `failure-showcase` — all downloadable from the run |
| Parallelisation | Two levels: a three-engine matrix, and Cucumber's own workers inside each job (4 under the `ci` profile). `fail-fast: false` means one engine failing does **not** cancel the others — they finish, upload their results and appear in the aggregated report, so "it only fails on WebKit" is visible at a glance |

### Part 4 — Test stability and reliability

| Requirement | How |
| --- | --- |
| Retry logic | Environment driven: 0 locally, 2 on CI — so a scenario is run **three times** before CI calls it failed. Narrowable with `RETRY_TAG_FILTER`. The API client separately retries only `429/500/502/503/504` |
| Smart waiting | Playwright auto-waiting → response waits (`clickAndWaitForApi`) → state polling. There is **no `waitForTimeout` anywhere**, enforced by `npm run check:guardrails` |
| Screenshot capture on failure | Full-page screenshot on every failed attempt, on disk and attached inside the HTML report |
| Flaky detection | `npm run flaky:check` reads the Cucumber **message stream** — the JSON report keeps only the final attempt, so it cannot see a retry at all |
| Mitigation strategy | [docs/test-stability.md](docs/test-stability.md) |

### Part 5 — Performance testing (bonus)

| Requirement | How |
| --- | --- |
| Login API | `performance/scenarios/login.ts` — CSRF fetch then credential post, ramping VUs |
| Employee creation API | `performance/scenarios/employee-create.ts` — authenticate, create, clean up |
| Threshold definitions | `performance/lib/thresholds.ts`, including per-endpoint thresholds via request tags |
| Performance reporting | Console summary, JSON, a self-contained HTML page, the raw k6 output, and a table on the CI run page |

k6 runs **in the pipeline on every trigger** — a short smoke on pull requests and
the full profile on `main` and on the nightly schedule.

### Part 6 — Reporting and observability

| Requirement | How |
| --- | --- |
| HTML test reports | `npm run report`; published as an artifact and to GitHub Pages |
| Screenshots and videos on failure | Both, plus a Playwright trace. Kept on failure, discarded on success |
| Tagging strategy | Documented in [docs/reporting.md](docs/reporting.md) **and enforced** by `npm run check:tags` in CI |
| Environment based test execution | `ENV=demo\|ci\|local`, overridable per variable, and exposed as inputs on the manual CI run |

---

## Beyond the brief

Coverage extras are marked in the [table above](#test-coverage). These are the
engineering extras:

| Addition | Why it is here |
| --- | --- |
| **Every module the instance ships is checked for reachability** | The brief names five. This instance has twelve, and a suite that visits five cannot say whether the rest survived a deployment. The nine the suite does not own data in are read-only |
| **The authentication boundary in depth** | Case sensitivity, whitespace, an injection string, an overlong name, `HttpOnly` on the session cookie, the back button after sign-out — and that an unknown account and a real one with the wrong secret are told the same thing |
| **Localization is proved rather than assumed** | Every control in this product is found by the label a user reads. Six scenarios change the instance language and date format on purpose and assert what moves with them and what does not |
| **The whole framework is TypeScript** | Every source file, including the tooling and the k6 scripts — see [below](#typescript). The compiler is the first CI gate |
| **Merge gate in two halves** | `tools/check-guardrails.ts` encodes the rules a reviewer applies by hand — no fixed waits, no assertions in page objects, no hard coded URLs or credentials, no focused or skipped scenarios — and needs no API key. The automated review is the layer on top |
| **PR review gate on every pull request** | The diff is reviewed against a test-automation rubric; a blocking finding fails the check. One secret to enable |
| **Slack and Teams notifications** | Bot token *or* webhook. A broken notification never changes a build result |
| **GitHub Pages report site** | The latest report from `main`, all engines, k6 and the failure showcase, at a stable URL — published automatically whenever the repository is public |
| **Failure showcase** | A deliberate failure, published so the failure path is visible without waiting for a real one |
| **Playwright traces on failure** | `npx playwright show-trace <file>.zip` replays DOM, network and console — usually removes the need to reproduce a CI-only failure |
| **Report tooling** | `npm run report:open` serves the report over localhost (Chrome blocks its feature pages over `file://`); `npm run report:zip` packs the report and the evidence into one file that can be attached to a Slack message or a ticket |
| **Four k6 scripts and five load profiles** | The brief asked for two endpoints; the suite covers login, employee creation, the read path and the full CRUD journey, each runnable as smoke, load, stress, spike or soak |
| **Cached CI** | npm, the Playwright browsers (keyed on the resolved Playwright version) and the k6 binary are all cached, so a repeat run installs nothing |
| **A run page with no false alarms** | The deliberate failure swallows its own exit code rather than using `continue-on-error`, which would stamp a red annotation on a healthy run; the actions are kept on current majors so no job carries a "Node.js 20 is deprecated" warning; and the run banner prints once instead of once per Cucumber worker. A warning nobody can act on trains people to ignore warnings |
| **Flaky history** | `reports/flaky-history.json` counts how often each scenario has needed a retry, separating one bad night from a genuinely unreliable test |
| **Enforced tagging rules** | `tools/check-tags.ts` fails CI when a scenario is in neither `@smoke` nor `@regression`. A convention that is only written down erodes |
| **Framework unit tests** | `lib/unit/`, beside the code they cover — they found two real defects in this framework before CI did, and two more surfaced when the suite was widened |
| **Centralised selectors** | Every `.oxd-*` class name lives in `lib/BasePage.ts` beside the code that uses it — a design-system change is one file |
| **Self-cleaning tests** | Every scenario registers what it created and deletes it in an After hook, even when it failed. The k6 script does the same |
| **Nightly full run** | So a change on the application's side is caught by the pipeline, not by the next pull request |
| **Cross-platform scripts** | `cross-env` throughout, so a reviewer on Windows can run everything |

---

## TypeScript

Every file in the framework is TypeScript. There is no `.js` file anywhere in the
repository — `npm run typecheck` covers the framework and the k6 scripts, and it
is the first step of CI, ahead of the linter.

That is not a stylistic preference. In a test framework the types are load
bearing in a specific way: a step definition that reads `this.state.employee` has
no test of its own, so a rename or a wrong shape does not fail a build, it fails a
scenario — at three in the morning, against the shared demo instance, looking
exactly like the application being broken. The compiler moves that class of
failure from a red run to a red squiggle.

The conversion found two real defects, which is the honest argument for it:

| Found by the compiler | What it was |
| --- | --- |
| `slowMo` in `config/playwright.config.ts` | It was set as a *context* option, where Playwright ignores it. It is a launch option. The setting had been silently doing nothing in that file |
| `BasePage.open(url)` overridden with a different signature | Four page objects declared `open(baseUrl)` or `open(baseUrl, empNumber)` over a base method taking one meaning of `url`. The base method is now `navigateTo(url)` and each screen's `open` is its own thing |

Notes on how it is set up:

- **Two compilation units.** The framework compiles as CommonJS for Node; the k6
  scripts have their own `performance/tsconfig.json`, because they run in k6's
  runtime rather than Node's — ES modules, k6 globals, and imports that carry the
  `.ts` extension, which is how k6 resolves them. One tsconfig cannot describe
  both honestly.
- **`strict` is on**, including `strictNullChecks`. The one deliberate exception
  is the Cucumber world's browser handles, which are declared with definite
  assignment: the Before hook creates them before the first step runs, so a null
  check in every step definition would be noise that can never fire.
- **`cucumber.yaml`** exists because Cucumber only reads its configuration from
  JavaScript, JSON or YAML, never TypeScript. The static shape of each profile
  lives there. Two settings cannot: how many workers and how many retries belong
  to the *environment* rather than to the profile — four and two on CI, two and
  none locally — so `tools/run-suite.ts` resolves the environment and passes
  them on the command line. That is what lets the repository hold no JavaScript
  at all without pretending those numbers are constants.
- **The report generator carries its own type declaration.**
  `multiple-cucumber-html-reporter` ships none, so
  `config/report/multiple-cucumber-html-reporter.d.ts` declares the options this
  project actually passes - a typo in that call is still a compile error, and
  the declaration sits beside its one caller rather than in a folder of its own.

---

## Repository structure

```
.github/
  workflows/ci.yml             static analysis → tests (3 engines) → report → Pages → notify
  workflows/pr-review.yml      PR review gate on pull requests
  scripts/pr-review.ts         the gate itself
  branch-protection.json       the required-checks rule, ready to apply

config/
  playwright.config.ts         browser settings, derived from the environment
  environments/                demo.json, ci.json, local.json
  report/                      report generator, custom styles, job summary, Pages
                               landing page, and the reporter's type declaration

cucumber.yaml                  one profile per browser, plus the showcase profile
tsconfig.json                  the framework's compiler settings

features/                      Gherkin only — no selectors, no code
step-definitions/              glue code; every assertion lives here
page-objects/                  one class per screen + shared components, index.ts registry

lib/
  BasePage.ts                  the base every screen extends - interactions,
                               waiting, the selector catalogue and the shared types
  logger.ts                    the console format used in CI
  api/                         ApiClient + endpoint map
  config/environment.ts        the single place configuration is resolved
  reporting/                   pure report logic - result summary, chart layout
  utils/                       data-helper, date-format
  unit/                        unit tests, beside the code they cover

hooks/hooks.ts                 setup, evidence capture, data teardown
support/world.ts               per-scenario browser, context, API client, page registry
support/actions.ts             domain actions shared by the step definitions
test-data/                     fixtures, and the factory that builds unique records

performance/                   k6 scenarios, load profiles, shared thresholds, reporter
                               (its own tsconfig - k6's runtime, not Node's)
tools/                         flaky detector, checkers, notifier, report open/zip
docs/                          architecture, ci-cd, stability, reporting, performance
docs/sample-run/               committed snapshot of a real pipeline run
reports/                       generated output, one folder per browser (git ignored)
```

One branch per part of the assignment, each merged through a pull request that
had to pass CI and the review gate:

| Branch | Part |
| --- | --- |
| `feat/part-1-e2e-automation` | Advanced end-to-end automation |
| `feat/part-2-framework-design` | Framework design and engineering |
| `feat/part-3-cicd-pipeline` | CI/CD pipeline integration |
| `feat/part-4-test-stability` | Test stability and reliability |
| `feat/part-5-performance-k6` | Performance testing |
| `feat/part-6-reporting-observability` | Reporting and observability |

Later branches carry the fixes and the extra coverage.

### The locator strategy

OrangeHRM ships no test ids, so the rule is:

1. **Anything a user can name** — a field, a menu item, a row action — is
   addressed by that name, or by the label beside it. Those survive a restyle
   and read like the interface.
2. **Everything else** uses the component class, and every one of those lives in
   [`lib/BasePage.ts`](lib/BasePage.ts). When the design system moves, that
   file is the diff — not fifteen page objects.
3. **One documented exception: the form buttons.** Sign in, Search, Save, Reset
   and Cancel are addressed structurally — the form's `type="submit"`, or the
   ghost variant of the button component — rather than by the word on them.
   That is not inconsistency, it is the same rule applied to a screen whose
   labels are somebody else's setting: the display language is instance-wide,
   this suite has watched it change under a running scenario, and the
   localization scenarios have to *read* those labels back to prove it. A
   locator that already assumes the label cannot do that.

No page object contains a raw `.oxd-*` string; `npm run check:guardrails` keeps
hard coded URLs and credentials out of them as well.

---

## Configuration

Resolved in `lib/config/environment.ts`, lowest priority first:

1. `config/environments/<ENV>.json` — checked-in defaults (`demo`, `ci`, `local`)
2. `.env` — local overrides, git ignored (`cp .env.example .env`)
3. Real environment variables — what CI uses

| Variable | Default | Meaning |
| --- | --- | --- |
| `ENV` | `demo` | Which environment file is the base layer |
| `BASE_URL` | from the environment file | Application under test |
| `BROWSER` | `chromium` | Engine, and the report folder name |
| `HEADLESS` | `true` | `false` to watch the run |
| `SLOW_MO` | `100` (`0` on `ci`) | Milliseconds Playwright pauses before each action — see below |
| `WORKERS` | `3` (`4` on `ci`) | Cucumber parallel workers |
| `RETRY` | `1` (`2` on `ci`) | Scenario retries, so `2` means three attempts. Every retry is still reported by `npm run flaky:check` |
| `RETRY_TAG_FILTER` | empty | Limit retries to a tag expression, e.g. `@flaky` |
| `TRACE` | `retained-on-failure` | `on` keeps every trace, `off` disables |
| `VIDEO` | `retain-on-failure` | `on` keeps every video, `off` disables |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | demo credentials | Override for a real instance |
| `ESS_PASSWORD` | `EssUser@2024` | Password for the ESS account the role tests create |

### `SLOW_MO`, and what it is not

Playwright pauses for `SLOW_MO` milliseconds **before every action** — each
click, fill and key press. It changes nothing else: timeouts, waits and
assertions behave exactly as they did.

| Where | Value | Why |
| --- | --- | --- |
| `demo` (the local default) | `100` | Fast enough not to be tedious, slow enough to follow what the test is doing when you run it headed |
| `local` | `150` | Aimed at debugging against a local instance |
| `ci` | `0` | Nobody is watching. On CI it is pure wall-clock cost — across three engines and 67 scenarios, 100 ms per action is minutes of nothing |

```bash
npm run test:headed          # HEADLESS=false SLOW_MO=250, one worker - watch it work
SLOW_MO=0 npm test           # fastest local run
SLOW_MO=500 npm run test:headed   # slow enough to narrate
```

**It is deliberately not used to fix flakiness.** Slowing everything down makes a
race less likely to be lost, but the race is still there — the test now passes
for a reason unrelated to the application being correct, and it will come back on
a slower machine or a busier day. Every wait in this suite is on a state or on a
response (see [Stability](#stability)); `SLOW_MO` exists so a human can watch,
nothing more.

---

## Running tests

```bash
npm test                      # 67 scenarios on Chromium
npm run test:all              # all three engines, one after another
npm run test:firefox
npm run test:webkit
npm run test:smoke            # @smoke only
npm run test:regression
npm run test:retry            # two retries, the way CI runs it
npm run test:headed           # one worker, visible browser, slowed down
npm run test:failure-demo     # the deliberate failure, for the reports

npm run test:chromium -- --tags "@pim and @negative"
npm run test:chromium -- --tags "@regression and not @flaky"

ENV=ci npm test
BASE_URL=https://my-instance npm test
```

| Script | Purpose |
| --- | --- |
| `npm run verify` | Everything the CI `Static analysis` job runs |
| `npm run typecheck` | Compile the framework and the k6 scripts, emitting nothing |
| `npm run report` | Build the HTML report from whatever is under `reports/` |
| `npm run report:open` | Serve and open it - Chrome blocks the feature pages over `file://` |
| `npm run report:zip` | Pack the report and the evidence into one shareable zip |
| `npm run flaky:check` | List scenarios that only passed after a retry |
| `npm run check:tags` | Enforce the tagging rules |
| `npm run check:guardrails` | Deterministic review rules over the test code |
| `npm run check:target` | Is the application under test up, and are the credentials good? |
| `npm run test:unit` | Unit tests for the framework's own utilities |
| `npm run notify` / `notify:dry-run` | Send, or preview, the Slack/Teams message |
| `npm run perf` / `perf:smoke` | All four k6 load tests, at full load or as a smoke |
| `npm run perf:summary` | The k6 threshold table as markdown |
| `npm run lint` / `npm run format` | ESLint and Prettier |

---

## Reports and artifacts

```
reports/<browser>/cucumber-report.json      final attempt, machine readable
reports/<browser>/cucumber-messages.ndjson  every attempt — what the flaky detector reads
reports/<browser>/html-report/index.html    human readable report
reports/<browser>/screenshots|videos|traces evidence from failed attempts
reports/flaky-history.json                  how often each scenario has flaked
performance/results/                        k6 JSON, HTML and raw summaries
```

| Where to look | What is there |
| --- | --- |
| `html-report` artifact, or GitHub Pages while the repository is public | Latest run on `main`: all three engines, the k6 summaries and the failure showcase |
| [`docs/sample-run/`](docs/sample-run) | Committed snapshot: raw results, message stream, k6 summaries, a failure screenshot |
| [Actions](https://github.com/shaunhuynhaegistack/CMCChallenge/actions) → a run | `html-report`, `results-<browser>`, `performance-results`, `failure-showcase` — all downloadable |
| The run summary page | Pass/fail per browser, the flaky check, and the k6 threshold table |

Full detail in [docs/reporting.md](docs/reporting.md).

---

## Slack / Teams — one secret and it works

`tools/notify.ts` posts the run result after the report job, built from the same
summary the run page uses so the numbers always agree. It is optional: with
nothing configured the step logs that it is skipping and the job stays green.

### Slack, option A — bot token and channel id (recommended)

1. <https://api.slack.com/apps> → **Create New App** → *From scratch*.
2. **OAuth & Permissions** → *Bot Token Scopes* → add **`chat:write`**.
3. **Install to Workspace**, then copy the **Bot User OAuth Token** (`xoxb-…`).
4. In Slack, invite the bot to the channel: `/invite @your-app-name`.
5. Copy the **channel id**: right-click the channel → *View channel details* →
   the id (`C0123ABCD`) is at the bottom.
6. Repository → **Settings → Secrets and variables → Actions → New repository secret**:

   | Secret | Value |
   | --- | --- |
   | `SLACK_BOT_TOKEN` | `xoxb-…` |
   | `SLACK_CHANNEL_ID` | `C0123ABCD` |

That is the whole setup — no code change.

### Slack, option B — incoming webhook

1. Same app → **Incoming Webhooks** → enable → *Add New Webhook to Workspace* →
   pick the channel.
2. Add the `https://hooks.slack.com/services/…` URL as the secret
   **`SLACK_WEBHOOK_URL`**.

If both are configured the bot token wins.

### Teams

1. In the channel: **⋯ → Workflows** → *Post to a channel when a webhook request
   is received*.
2. Finish the flow, copy the generated URL.
3. Add it as the secret **`TEAMS_WEBHOOK_URL`**.

The payload is an Adaptive Card, which is what the Workflows (Power Automate)
webhook expects; the older Office 365 connector URLs are being retired.

### What the message contains

Repository, branch, browsers, environment, duration, start and end time, who
triggered the run, and either "all N scenarios passed" or the first five
failures — with buttons to **View Run** and **Download Report**.

With the bot token, CI also **uploads the zipped report into the channel**, so
anyone there can download the HTML report, the screenshots and the videos
without a GitHub account.

```bash
npm run notify:dry-run     # print the exact Slack and Teams payloads, send nothing
```

To send from your machine, put the secrets in `.env` and run `npm run notify`.

---

## CI/CD and the merge gate

`.github/workflows/ci.yml` runs on pull requests, pushes to `main`, a nightly
schedule, and on demand.

| Job | What it does |
| --- | --- |
| `Static analysis` | TypeScript, ESLint, Prettier, tagging rules, guardrails, framework unit tests |
| `Resolve browser matrix` | Which engines to run (all three by default) |
| `E2E (chromium\|firefox\|webkit)` | The suite, **one job per engine, all three in parallel** |
| `k6 performance` | Load tests — a short smoke on pull requests, the full profile on `main`. Runs **after** the browser jobs, not alongside them: three engines hammering the same shared instance is load in its own right, and a load test measured through someone else's traffic measures nothing |
| `Failure showcase` | The deliberate failure, non-blocking, published for the reports |
| `Aggregate report` | Builds the HTML report, publishes artifacts, writes the run summary, notifies Slack/Teams |
| `Publish the report site` | Deploys the report to GitHub Pages, in the same graph and directly after the jobs that produced it. It runs on every event rather than being conditioned away, because a job skipped by an `if:` still appears in a pull request's check list as a permanently grey entry — and a check list that always has one teaches people to stop reading it. On a pull request the job runs, says why it is not publishing, and passes. The "main only" rule lives in the job's first step rather than in the environment's branch policy, because an environment rule is evaluated *before* the first step runs and would fail every pull request outright |

**Run it by hand:** *Actions → CI → Run workflow* takes an environment profile, a
JSON array of browsers, and a Cucumber tag expression.

### The gate

* **Deterministic** — `npm run check:guardrails`, in `Static analysis`. No key, no
  third party, always runs.
* **Model-assisted** — `.github/workflows/pr-review.yml` reviews the diff against a
  test-automation rubric and **fails the check on a blocking finding**. Two
  providers, the first configured one wins:

  | Provider | Secret | Notes |
  | --- | --- | --- |
  | Greptile | `GREPTILE_API_KEY` | Reviews against an index of the **whole repository**, so it can flag a consequence in a file the diff never touched |
  | GitHub Models | no secret; the repository **variable** `GITHUB_MODEL` names the model to ask | Free on public repositories and uses the workflow's own token, but being retired by GitHub, so it is the last resort |

  With none configured the check reports "not evaluated" and passes, rather than
  blocking the repository on somebody else's outage.

* **Greptile**, installed as a GitHub App, is a required check in its own right
  (`Greptile Review`). It is **free**: their Starter plan costs nothing, and they
  are free outright for non-commercial MIT or Apache projects — which this is,
  see [LICENSE](LICENSE).

  It has already earned its place. On the pull request that added most of this
  work it reported three defects, two of them P1, and all three were real:

  | Finding | Why it mattered |
  | --- | --- |
  | **Pull request code was handed the admin credentials** | The performance job checks out the branch's own code and ran it with `ADMIN_USERNAME`/`ADMIN_PASSWORD`. A k6 script is arbitrary code with outbound HTTP, so a pull request could have edited one and posted the secrets anywhere. Credentials are now withheld from pull request runs |
  | **A malformed URL killed the report server** | `decodeURIComponent` throws on an escape like `/%`; the throw was outside the error handling, so one bad request took the whole server down |
  | **The Greptile provider was written but never registered** | An edit had silently missed the provider list, so the code was there and unreachable |

  A gate that finds a P1 in its own pipeline is the argument for having one.

Both halves are required checks. `.github/branch-protection.json` holds the rule:

```bash
gh api -X PUT repos/:owner/:repo/branches/main/protection \
  --input .github/branch-protection.json
```

CodeRabbit works the same way and is also free for public repositories.

---

## Stability

### A failing scenario is run again before it is believed

| Environment | `--retry` | Attempts before a scenario is called failed |
| --- | ---: | ---: |
| `local` | 0 | **1** |
| `demo` | 1 | **2** |
| `ci` | 2 | **3** |
| the `showcase` profile | 0 | **1** — it is supposed to fail |

Retries are on where the target is least predictable and off where it is not, so
a real failure is never hidden while developing. They apply to every scenario;
`RETRY_TAG_FILTER` narrows them to a tag expression if you would rather only
retry the ones already known to be unreliable.

### A retry is reported, not swallowed

Retrying quietly is how a suite stops being trusted, so nothing is quiet here.
`npm run flaky:check` reads the Cucumber **message stream** — the only source
that keeps every attempt; the JSON report keeps the final one and would show a
clean pass — and prints what needed a second chance:

```
1 scenario(s) needed a retry, 1 of them recovered:

- [firefox] Contact details saved in the UI are returned by the API
    attempts      : 2 (final: passed)
    first failure : page.waitForResponse: Timeout 30000ms exceeded
    seen flaky    : 1 run(s) so far
```

CI runs that step with `if: always()`, so it reports on a red job too, and writes
it to the run summary page rather than burying it in the log. `seen flaky` comes
from `reports/flaky-history.json`, which is what separates one bad night from a
test that is genuinely unreliable.

### What retries cannot do, and what covers that instead

A retry rescues a scenario that hit a moment of noise. It does nothing when the
target itself is unavailable, because the second and third attempts fail for the
same reason — the run simply takes three times as long to arrive at the same
place. That is not hypothetical: a CI run of this suite failed on all three
engines with

```
waiting for getByRole('button', { name: 'Login' }) to be visible
Timeout 30000ms exceeded
```

which is the shared demo instance not serving its login form. The same commit
passed 34/34 locally and passed on CI on the next run.

`npm run check:target` exists for exactly that case: it asks whether the login
page answers, whether the credentials are accepted and whether the API responds
*before* the suite starts, so an outage reads as an outage instead of as thirty
assertion failures that all say the wrong thing.

### The rest

* Waits are auto-waiting first, response waits second, state polling last. No
  `waitForTimeout` anywhere — the guardrail check enforces it.
* Every failed attempt writes a screenshot, a video and a Playwright trace.

Detection and mitigation in [docs/test-stability.md](docs/test-stability.md).

---

## Performance

**Everything in this section goes beyond the brief.** It asked for two load
tests - login and employee creation - with thresholds and reporting. Those are
scripts 1 and 2; the rest is extra.

| Script | Journey | | Peak VUs |
| --- | --- | --- | ---: |
| `login.ts` | Fetch the login page for its CSRF token, then post the credentials | **Brief** | 5 |
| `employee-create.ts` | Authenticate, create an employee, delete it again | **Brief** | 3 |
| `employee-search.ts` | The read path: an unfiltered page and a filtered one, timed separately | Extra | 8 |
| `employee-lifecycle.ts` | The whole write journey per iteration: create → read back → update → delete, each step timed on its own | Extra | 3 |

### Load profiles — also extra

One environment variable reshapes any script, because "does it work", "does it
hold", "where does it break" and "what happens on a burst" are the same journey
under different load:

| `PERF_PROFILE` | Shape | Answers |
| --- | --- | --- |
| `smoke` | 1 VU, 20s | Is the script and the target alive? Runs on every pull request |
| `load` (default) | Ramp to peak, hold, ramp down | Does it hold at the expected load? |
| `stress` | Steps to 4× peak | *Which step* does it start to degrade at |
| `spike` | Idle, 5× burst, idle | Does it recover after a sudden burst |
| `soak` | Half peak, long hold | Does it drift over time |

```bash
npm run perf                                # all four, at load
npm run perf:smoke                          # all four, as a smoke
PERF_PROFILE=stress npm run perf:login      # find the knee
VUS=20 HOLD=5m npm run perf:search
```

Thresholds live in `performance/lib/thresholds.ts`; requests are tagged per
endpoint so a threshold can talk about one call rather than the whole iteration.
Every run writes JSON, HTML and raw summaries into `performance/results/`, and CI
prints the threshold table onto the run page.

The thresholds are calibrated against the demo instance **as seen from a GitHub
runner** — see [docs/performance.md](docs/performance.md) for why that matters.

---

## Known defects this suite found

Against <https://opensource-demo.orangehrmlive.com/>. Each is pinned by a
scenario or handled in exactly one place.

| Defect | Evidence | Handled by |
| --- | --- | --- |
| **Employee id silently truncated in the UI.** The column holds 10 characters. The API rejects a longer value with `422`; the UI accepts it, cuts it short and reports success — so the record is saved under an id nobody asked for and the follow-up search finds nothing. | A UI creation "succeeded", the list search returned zero rows | The limit is enforced once in `test-data/employee-factory.ts`, asserted by a unit test |
| **The personal details form discards input typed before its own XHR lands.** It renders empty inputs and populates them when the record arrives, overwriting anything already typed — and the save then reports success while storing nothing. This is data loss, not a test timing problem. | Two fields saved as empty strings while the toast said "Successfully Updated" | `PersonalDetailsPage.waitUntilLoaded`; the contact details screen has the same shape and the same fix |
| **Offset pagination is not stable over a sort key with ties.** Two records that compare equal can come back in a different order on each request, so page two repeats a row page one already returned and drops another entirely — records silently disappear from any UI that pages. | Three employees sharing a last name: sorted by that name, page two returned `[825]` when page one had already returned `[825, 824]`. Sorted by employee id, no overlap | `ApiClient.listEmployees` sorts by employee id, which is unique. The suite found this by flaking, and the flaky detector named the scenario |
| **The display language is instance-wide, mutable by anyone, and changes under a running suite.** Every control in this product is addressed by the label a user reads — it ships no test id anywhere — so the moment somebody switches the instance to Spanish, every scenario fails on a button that is perfectly visible and simply says `Ingresar`. | Three CI runs failed on all three engines with `waiting for getByRole('button', { name: 'Login' })`; the failure screenshot shows the login form rendered in Spanish. On a later run the breadcrumb came back as `Pizarra de pendientes` **mid-run**, having been English when the run started | Two layers, because one is not enough on a shared target: `tools/run-suite.ts` normalises language and date format before the suite starts, and `signIn` re-checks after every sign-in and repairs the drift. Both log what they found |
| **The password reset request is throttled.** After a handful of submissions the form stops answering: it neither navigates to the confirmation nor reports an error, it simply stays where it is. | Submitting a reset navigated to `/auth/sendPasswordReset` on the first attempts and stopped doing so afterwards, with no message | `features/password-reset.feature` asserts the screen, its validation and its navigation, and deliberately stops short of submitting. The property a submission would have proved — that the response does not reveal whether an account exists — is asserted on the login form instead |
| **The login form does not trim the user name.** A value pasted from a document with its surrounding whitespace is refused as invalid credentials, with no hint that the spaces are the reason. | `"  Admin  "` with the correct password is rejected; `Admin` is accepted | Pinned by a scenario asserting the current behaviour, so a change in either direction is noticed rather than discovered |
| **A deleted employee returns `422 Invalid Parameter`, not `404`.** | `GET /pim/employees/{n}` after deletion | The deletion assertion accepts either |
| **Filtered lists keep the previous rows on screen** while the new request is in flight, so an assertion made straight after Search reads stale data. | The first flaky failure this suite produced — roughly one run in three | `BasePage.clickAndWaitForApi` waits for the response the click triggered |
| **Dates render in an instance-wide format anyone can change.** The API stores ISO; the UI renders whatever *Admin → Configuration → Localization* says. On a shared instance that is other people's mutable state. | Stored `1992-04-18`; the screen showed `1992-18-04` one evening and `1992-04-18` the next morning | The assertion reads the format from `/api/v2/admin/localization` and renders the expected value with it (`lib/utils/date-format.ts`) |

A second scenario fell into the same trap and CI caught it: it compared the
unfiltered "(n) Records Found" on screen with the API's total. That passed
locally and failed on CI, because the suite's own parallel workers create and
delete employees between the two reads. It now compares the two counts **for the
same filter**, on a record the scenario just created.

The date one is worth dwelling on, because the first version of this suite got it
wrong. The swapped date looked like an application bug and a scenario was written
to pin it as one. It went green locally and red on CI the next morning — somebody
else had changed the setting. **An assertion on shared configuration is not a
test, it is a coin flip.** The fix was to read the configuration and assert
against it.

### And five in this framework, found by its own tests

| Defect | How it was found |
| --- | --- |
| **The employee id generator was not unique.** It combined a timestamp with the worker pid, so two records built inside the same millisecond in the same worker got identical ids — which OrangeHRM rejects. | `lib/unit/employee-factory.test.ts` asked for 25 ids and got **1 distinct value**. A sequence component was added |
| **The report aggregator froze the working directory at import time.** Harmless for the CLI, wrong for any other caller, and it made the module untestable. | The first unit test against it read an empty result set from a fixture that was definitely there |
| **A filtered search could read the rows from before the filter.** `clickAndWaitForApi` resolved on the first response matching the list route, which can be the request the screen was already making when the click landed. The assertion then counts the unfiltered rows. | Searching the user list for a name that does not exist reported **10 rows** while the same query returned `total=0` from the API. The wait is now narrowed to the query the click actually causes |
| **A back-button assertion proved nothing.** After signing out, pressing back redraws the dashboard from the browser's own cache without asking the server, so asserting the URL says nothing about whether the session survived. | The scenario failed on a URL that was correct and meaningless. It now reloads the page: a signed out session cannot answer, and the application sends the browser back to the login form |
| **The row delete action was addressed by position.** `.last()` on a row's icon buttons is the delete on the employee list and the **edit** on the admin user list, which orders them the other way round — so the scenario opened a form and waited for a confirmation dialog that was never coming. | The admin deletion scenario timed out on the dialog. Both are now addressed by the icon they carry |

All five would otherwise have surfaced months later as an unexplained flaky
failure, or worse, as a green assertion that was never testing anything.

---

## Notes on the assignment

Where the brief is ambiguous, or where following it literally would have produced
a worse result. Each lists the decision taken.

1. **"Role-based validation" has no second role to use.** The demo publishes one
   credential (`Admin`/`admin123`); there is no ESS account to sign in with. The
   suite *provisions* one: it creates an employee and an ESS user, signs in as
   that user in a separate browser context, asserts the restricted menu, the
   `403` on the admin page and on the admin API — and, separately, that the same
   user *can* read the directory but *cannot* create an employee — then deletes
   both. Asserting only what Admin can see would not have tested role-based
   access at all.

2. **The brief asks for "API-level verification" without naming an API.**
   OrangeHRM's public REST API is a different product; the demo only exposes the
   session-authenticated `/web/index.php/api/v2` routes its own SPA uses. Those
   are what the suite asserts against, using the cookie created by the UI login —
   arguably the stronger check, since it verifies the same session the user is
   driving.

3. **The target is a shared, public, self-resetting instance.** Anyone can be
   creating and deleting employees while the suite runs. Consequences: no
   scenario asserts a total record count it did not just read from the API, all
   test data carries a timestamp-plus-worker discriminator, every scenario deletes
   what it created, and nothing asserts on instance-wide configuration without
   reading it first.

4. **"Test reports" and "build artifacts" as repository deliverables.** Committing
   every generated report makes a repository unreviewable within a few runs — the
   HTML report bundles its own CSS and JavaScript and each video is a couple of
   megabytes. Three things instead: `reports/` is git ignored; every run publishes
   artifacts; the latest report from `main` is deployed to
   [GitHub Pages](https://shaunhuynhaegistack.github.io/CMCChallenge/); and
   [`docs/sample-run/`](docs/sample-run) holds a committed snapshot.

5. **A load test on a shared demo should not run at full load on every commit.**
   k6 runs on every trigger, but a pull request gets a short smoke and `main` gets
   the full profile. The job is `continue-on-error`: thresholds are evaluated and
   published, but the latency of somebody else's instance does not turn this
   pipeline red. On a system we owned, it would gate.

6. **The brief never asks to see a failing test.** A suite that only ever shows
   green tells a reviewer nothing about the failure path, so
   `features/failure-showcase.feature` fails on purpose and publishes the report,
   screenshot, video and trace. It is excluded from every normal run and from the
   67 counted scenarios.

7. **Three days, six parts.** The scope is wide rather than deep by design. Depth
   a real project would add next: leave and recruitment modules, visual
   regression, accessibility checks, contract tests against the API schema, and a
   test-data service instead of on-the-fly provisioning.

---

## Design decisions

* **Page objects never assert.** They expose actions and queries; step definitions
  decide what is correct. That is what lets one page object serve a positive and a
  negative scenario.
* **The API client is built from the browser context.** `context.request` shares
  cookies with the page, so API assertions run inside the session the UI login
  created.
* **API for preconditions, UI for the thing under test.** The ESS account in the
  role scenario is setup, not the subject, so it is provisioned over the API.
* **Configuration is resolved once, in one file.** Nothing else reads
  `process.env` for configuration.
* **Retries are a safety net, not a fix.** Every retry is recorded and surfaced by
  the flaky detector so it becomes a work item rather than a habit.
* **Nothing asserts on state the suite does not own.** Not record counts, not the
  instance's date format, not data created by other people.

More in [docs/architecture.md](docs/architecture.md).

---

## Documentation

| Document | Contents |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Layering rules, the World, configuration precedence, waiting strategy |
| [docs/ci-cd.md](docs/ci-cd.md) | Pipeline jobs, parallelism, both halves of the gate, branch protection |
| [docs/test-stability.md](docs/test-stability.md) | Retries, evidence, flaky detection and mitigation |
| [docs/reporting.md](docs/reporting.md) | Artifacts, tagging strategy, environment execution, notifications |
| [docs/performance.md](docs/performance.md) | k6 load model, thresholds, reporting |
