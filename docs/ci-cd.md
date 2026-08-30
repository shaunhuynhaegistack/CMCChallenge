# CI/CD

Two workflows run on every pull request into `main`, and both are meant to be
required checks before a merge is allowed.

## `CI` - `.github/workflows/ci.yml`

| Job | What it does |
| --- | --- |
| `static-analysis` | `npm ci`, ESLint, Prettier, tagging rules, guardrails, framework unit tests |
| `matrix` | Resolves the browser list (all three by default, overridable on manual runs) |
| `test` | One job per engine - Chromium, Firefox, WebKit - installing dependencies and browsers, running the suite and uploading the raw results |
| `failure-showcase` | Runs the deliberate failure in its own profile, non-blocking, so the reports have a failure to show |
| `report` | Downloads every browser's results, generates the HTML report, publishes it as an artifact and writes the run summary |
| `publish` | Deploys the report to GitHub Pages, from `main` only - on a pull request it runs, says why it is not publishing, and passes |
| `performance` | The k6 load tests, after the browser jobs rather than beside them - see [performance.md](performance.md) |

### Parallelisation

Two levels:

1. **Across engines** - the `test` job is a matrix over `chromium`, `firefox`
   and `webkit`, so all three run at the same time. `fail-fast: false`
   is what makes one engine's failure informative rather than destructive: the
   other two finish, upload their results and appear in the aggregated report,
   so "it only fails on WebKit" is visible at a glance instead of hiding behind a
   cancelled matrix.
2. **Inside a job** - Cucumber runs `execution.workers` scenarios in parallel
   (4 under the `ci` environment profile).

### Artifacts

| Artifact | Contents |
| --- | --- |
| `results-<browser>` | Cucumber JSON plus the screenshots of failed scenarios |
| `flaky-history-<browser>` | How often each scenario has needed a retry, carried between runs through the actions cache |
| `html-report` | The generated HTML report for every browser |

The run summary (scenario counts per browser and the list of failures) is written
to the GitHub Actions summary page, so the outcome is readable without
downloading anything.

### Manual runs

`Actions -> CI -> Run workflow` accepts an environment profile, a JSON array of
browsers, a Cucumber tag expression and a k6 load profile - so a single run can
be "only `@smoke`, only on Chromium, against `demo`", or "the full suite plus a
`stress` load profile".

## The merge gate has two halves

**Deterministic**, in the `static-analysis` job - `tools/check-guardrails.ts`
encodes the rules a reviewer would otherwise apply by hand:

| Rule | Why |
| --- | --- |
| no fixed waits (`waitForTimeout`, `setTimeout` as a delay) | A fixed wait hides a race rather than removing it. the one legitimate delay - the polling backoff in `sleep` - carries an inline `guardrail-allow` comment, so the exception stays visible in review |
| no assertions inside page objects | Page objects expose actions and queries; the step definition decides what is correct |
| no hard coded URLs | They come from the resolved environment |
| no credentials in step definitions or page objects | They come from fixtures or the environment |
| no `@only` / `@skip` / `@wip` tags | A focused or skipped scenario silently shrinks the suite |

This half needs no API key and no third party service, so the gate is meaningful
on its own.

**Model-assisted**, in `.github/workflows/pr-review.yml` - the layer on top, for what a fixed
list of rules cannot see. The diff is reviewed by a model against a rubric aimed
at test automation:

* correctness bugs, broken selector strategies, assertions that cannot fail
* hard coded waits, credentials or environment values
* assertions leaking into page objects
* test data that can collide between parallel workers
* changes that silently weaken the suite (a skipped scenario, a removed assertion)

The model answers with strict JSON. Findings are posted as a pull request comment
and repeated in the job summary. **A `blocking` finding fails the job**, which is
what makes it a merge gate.

### Providers

The script tries providers in order and the first configured one wins:

| Order | Provider | Configuration | Notes |
| --- | --- | --- | --- |
| 1 | **Greptile** | Repository secret `GREPTILE_API_KEY` | Reviews against an index of the **whole repository**, not just the diff, so it can see a consequence in a file the diff never touched |
| 2 | **GitHub Models** | No secret beyond the workflow's own `GITHUB_TOKEN`; the repository **variable** `GITHUB_MODEL` names the model to ask, since a model name is not a secret | Free on public repositories, but GitHub has begun retiring it, so it is the last resort |

**To turn the gate on: add one repository secret.**
*Settings → Secrets and variables → Actions → New repository secret*. Nothing
else changes.

With no provider configured, or when every configured provider fails, the check
reports "not evaluated" and passes, so an outage elsewhere cannot block the
repository. Set `REVIEW_STRICT: 'true'` in the workflow to make those cases
fail instead - worth doing once a provider is configured and proven.

### Greptile - and how to get it for free

Greptile has a **free Starter plan** (one developer, unlimited repositories, 50
credits a month) and is **free outright for non-commercial projects under an MIT
or Apache licence**, which this repository is - see [LICENSE](../LICENSE).

Two ways to use it, and they are not exclusive:

**As the review provider in this pipeline** - already wired up:

1. Sign up at <https://www.greptile.com/> and create an API key.
2. Add it as the repository secret `GREPTILE_API_KEY`.

That is all. The first pull request afterwards reports "not evaluated" and
*submits the repository for indexing* on the way out; indexing runs in the
background and every run after it is reviewed. Greptile answers against that
index, so its findings can point at a caller the diff never touched.

**As their GitHub App** - a separate product that reviews pull requests itself.
This repository has it installed, and its `Greptile Review` check is required:

1. Install the Greptile app on the repository and grant it pull request access.
2. Let it run once so the `Greptile Review` check appears in the branch
   protection list.
3. Add that check to the required checks below.

It found three real defects on its first run here, two of them P1 - see the
merge gate section of the [README](../README.md#cicd-and-the-merge-gate).

CodeRabbit works the same way and is also free for public repositories. The gate
is defined by branch protection, not by which reviewer produced it, so any of
them can be swapped in without touching the pipeline.

## Keeping the run page honest

A green run should have nothing red on it, or the red stops meaning anything:

* **The deliberate failure swallows its own exit code.** `continue-on-error`
  would have worked, but it still stamps a red "Process completed with exit code
  1" annotation on a healthy run - exactly the confusion the showcase job exists
  to avoid. The step reports the failure in words instead, and raises a **warning
  if the scenario ever passes**, because that means the showcase has stopped
  showing anything.
* **The actions are kept on their current majors**, so the run page does not
  carry a "Node.js 20 is deprecated" warning on every job. A warning nobody can
  act on trains people to ignore warnings.

The same applies to the console: `BeforeAll` and `AfterAll` run once per Cucumber
worker, so the run banner used to print once per worker. It now prints once.

## Branch protection

The gate only blocks a merge once `main` is protected. Settings -> Branches ->
Add rule for `main`:

* Require a pull request before merging
* Require status checks to pass before merging, selecting
  * `Static analysis`
  * `E2E (chromium)`, `E2E (firefox)`, `E2E (webkit)`
  * `Aggregate report`
  * `Review the diff` (the PR review gate)
  * `Greptile Review`
* Require branches to be up to date before merging

`.github/branch-protection.json` deliberately does **not** require an approving
review: a single maintainer cannot approve their own pull request, so requiring
one would make the repository unmergeable. The status checks are the gate. Add
`required_pull_request_reviews` back on a team repository.

The same rule can be applied from the CLI:

```bash
gh api -X PUT repos/:owner/:repo/branches/main/protection \
  --input .github/branch-protection.json
```

---

## Publishing the report site, and the two traps in it

The `Publish the report site` job is the last stop in the graph, straight after
the report it publishes. Two things about GitHub Pages cost real time to
diagnose, so they are written down here rather than rediscovered.

**Pages is switched off when a repository goes private, and is not switched back
on when it goes public again.** Nothing in the workflow says so. `deploy-pages`
fails with a 404 and a message about creating a deployment, which reads like a
permissions problem and is not one:

```
Error: Failed to create deployment (status: 404) ... Ensure GitHub Pages has been enabled
```

The check that answers it in one line:

```bash
gh api repos/:owner/:repo/pages --jq '{status, build_type}'   # 404 means it is off
gh api -X POST repos/:owner/:repo/pages -f build_type=workflow
```

**Enabling Pages recreates the `github-pages` environment with its default
deployment branch policy.** Any change to that policy made beforehand is
silently replaced. So the order matters: enable Pages first, adjust the
environment afterwards, and check rather than assume.

That environment policy is also why the job carries its own "main only" test
instead of relying on one. An environment rule is evaluated *before the first
step of the job runs*, so a job that declares an environment it is not allowed
to deploy to does not skip - it fails, on every pull request. The rule therefore
lives in the job's first step, where it can report a decision:

```
A pull request run: the site is published from main only.
```

which is a check that passes and says why, rather than a permanently grey entry
in the check list.
