# Sample run

Output from a real pipeline run on `main`, committed so the reports can be read
without digging through the Actions tab. Working output is git ignored.

**This is a dated snapshot, not the current shape of the suite.** It captures
**102 scenarios (34 × 3 engines), all passing**, from the run that produced it.
The suite has since grown to 67 scenarios per engine; the artifacts here are
kept as they were rather than regenerated, because their value is being the
real output of a real run rather than a matching number. The current numbers
are on the [Pages site](https://shaunhuynhaegistack.github.io/CMCChallenge/) and
in any [workflow run](https://github.com/shaunhuynhaegistack/CMCChallenge/actions).

One scenario in that run — the Firefox contact-details one — needed a second
attempt, which is why the message stream here is worth reading: `npm run
flaky:check` finds the retry and the JSON report cannot, because the JSON only
keeps the final attempt.

| Path | What it is |
| --- | --- |
| `run-summary.md` | The per-engine table written to the workflow run page |
| `performance-summary.md` | The k6 threshold table, also written to the run page |
| `results/<engine>-cucumber-report.json` | The machine readable result for each engine |
| `results/chromium-cucumber-messages.ndjson` | The message stream - every attempt, retries included. This is what `npm run flaky:check` reads |
| `performance/*.html` | The k6 summaries for all four load scripts |
| `performance/*-summary.json` | The same numbers, machine readable, including every threshold and whether it held |
| `evidence/failed-scenario.png` | A failure screenshot, from the deliberate failure showcase, captured the way the After hook captures them |

## Where the rest lives

| | |
| --- | --- |
| **Full HTML report, latest run on `main`** | <https://shaunhuynhaegistack.github.io/CMCChallenge/> |
| **Every artifact, per run** | [Actions](https://github.com/shaunhuynhaegistack/CMCChallenge/actions) → a run → `html-report`, `results-<engine>`, `performance-results`, `failure-showcase`, `report-archive` |

The HTML report bundles its own CSS and JavaScript and a video is a couple of
megabytes each, so neither is committed - both are published instead. The
screenshot is small enough to be worth having in the repository.

## Reproducing it

```bash
npm ci && npm run install:browsers
npm run test:all && npm run report
npm run report:open
```
