# Framework architecture

## Layers

```
features/            Gherkin - business language only, no selectors, no code
step-definitions/    Glue - orchestrates page objects and owns every assertion
page-objects/        Screens and components - actions and queries, never assertions
lib/                 Framework internals shared by all of the above
support/             World construction, plus the domain actions steps reuse
hooks/               Cucumber lifecycle: setup, evidence, teardown
config/              Runner configuration and per environment defaults
test-data/           JSON fixtures
```

The rule that keeps the layers honest: **a page object never asserts**. It exposes
actions (`login`, `searchByEmployeeId`) and queries (`rowTexts`, `readDetails`);
the step definition decides what is correct. That is what allows the same page
object to be reused by a positive and a negative scenario.

## The World

`support/world.ts` builds one browser, one context, one page and one API client
per scenario, plus a lazily constructed page object registry. Two things are worth
calling out:

* **The API client is built from the browser context.** `context.request` shares
  cookies with the page, so every API assertion runs inside the session that the
  UI login created. Verifying a UI action against a separately authenticated API
  session would be a weaker check.
* **`created` is a per scenario ledger.** Steps push the ids they create onto it
  and an After hook deletes them. A scenario that fails in the middle of the
  lifecycle still cleans up after itself, which matters because the demo instance
  is shared.

## Configuration precedence

`lib/config/environment.ts` resolves configuration once per worker process:

1. `config/environments/<ENV>.json` - checked in defaults per environment
2. `.env` - developer machine, git ignored
3. Real environment variables - CI and one-off runs

Nothing else in the framework reads `process.env` for configuration, so there is
exactly one place to look when a run behaves differently to what you expected.

## Waiting strategy

Three mechanisms, in order of preference:

1. **Playwright auto-waiting** - the default. Locator actions already wait for the
   element to be attached, visible, stable and enabled.
2. **Response waits** - `BasePage.clickAndWaitForApi` resolves once the fetch that
   the click triggered has come back. Filtered lists keep the previous rows on
   screen until then, so this is the difference between asserting on the filtered
   result and asserting on stale rows.
3. **State polling** - `PersonalDetailsPage.waitUntilLoaded` and
   `lib/utils/waits.ts` cover the cases the first two cannot express, such as
   "the form has been populated by its own XHR".

There is no `waitForTimeout` anywhere in the suite.

## Locators

OrangeHRM ships no test ids, so there are two tiers:

1. **Anything a user can name** is addressed by that name - `getByRole('button',
   { name: 'Search' })`, or a field looked up through its label with
   `BasePage.fieldByLabel`. Those survive a restyle and read like the interface.
2. **Everything else** uses the component class, and every one of those lives in
   `lib/selectors.ts`. No page object contains a raw `.oxd-*` string, so a design
   system change is one file rather than fifteen.

## Reuse

Three places exist specifically so the same thing is not written twice:

| | |
| --- | --- |
| `page-objects/FilterableListPage.ts` | Everything the employee list and the admin user list share - search, reset, rows, record count, delete confirmation. Each screen declares only its own filters |
| `lib/BasePage.ts` | Interactions, waiting helpers and `fieldByLabel`, which three page objects previously had their own copy of |
| `support/actions.ts` | Sign in, create an employee, provision an account - the preconditions several features need, written once, each registering what it created for teardown |

The test for whether something belongs in `actions.ts`: is it the thing the
scenario is testing, or the thing the scenario needs before it can start? Setup
goes there and goes through the API; the subject stays in the feature and goes
through the UI.

## Adding a new screen

1. Add the page object under `page-objects/`, extending `BasePage`.
2. Register it in `page-objects/index.ts`.
3. Add fixtures to `test-data/` if the screen needs data.
4. Write the scenario, then the step definitions.

No change to the World, the hooks or the configuration is required.
