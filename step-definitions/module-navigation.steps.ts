import { When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { selectors } from '../lib/BasePage';
import { MODULE_ROUTES } from '../page-objects/ModuleNavigation';
import { logVerify } from '../lib/logger';
import type { OrangeHrmWorld } from '../support/world';

When(
  'I open the {string} module from the side menu',
  async function (this: OrangeHrmWorld, module: string) {
    await this.pages.modules.openFromMenu(module);
  }
);

Then('the browser should be on {string}', function (this: OrangeHrmWorld, route: string) {
  const url = this.page.url();

  logVerify(`Landed on ${url}, expected to contain "${route}"`);
  expect(url).toContain(route);
});

/**
 * The heading is read, not compared against a word. Which word it is depends on
 * the instance language, and the property under test is that the module renders
 * something of its own rather than an empty shell.
 */
Then('the module should render its own heading', async function (this: OrangeHrmWorld) {
  const heading = await this.pages.modules.moduleHeading();

  logVerify(`Module heading reads "${heading}"`);
  expect(heading.length).toBeGreaterThan(0);
});

Then(
  'the side menu should offer these modules',
  async function (this: OrangeHrmWorld, table: DataTable) {
    const expected = table.raw().map(([name]) => name);
    const offered = await this.pages.dashboard.sideMenu.moduleNames();

    logVerify(`Side menu offers ${JSON.stringify(offered)}`);
    expect(offered).toEqual(expect.arrayContaining(expected));
  }
);

/**
 * Asked over navigation rather than through the menu, so a module the menu
 * happens not to render is still proven reachable - and the status is the
 * assertion, because a module that is broken answers 500 while still drawing
 * a page shell.
 */
When('I request each module route directly', async function (this: OrangeHrmWorld) {
  const statuses: Record<string, number> = {};

  for (const module of Object.keys(MODULE_ROUTES)) {
    const response = await this.pages.modules.request(module);
    statuses[module] = response?.status() ?? 0;
  }

  this.state.moduleStatuses = statuses;
});

Then('every module route should answer with a success status', function (this: OrangeHrmWorld) {
  const statuses = this.state.moduleStatuses as Record<string, number>;

  logVerify(`Module routes answered ${JSON.stringify(statuses)}`);
  Object.entries(statuses).forEach(([module, status]) => {
    expect(status, `${module} answered ${status}`).toBeLessThan(400);
  });
});

/**
 * Asserted, not answered. Purge Records permanently deletes employee data on a
 * shared instance; the property worth proving is that the product refuses to
 * reach it on a session alone, and the suite stops exactly there.
 */
Then(
  'the screen should ask for the administrator credentials again',
  async function (this: OrangeHrmWorld) {
    const username = this.page.locator(selectors.usernameField);
    const password = this.page.locator(selectors.passwordField);

    await expect(username).toBeVisible();
    await expect(password).toBeVisible();
    logVerify('Maintenance is gated behind a second credentials prompt');
  }
);
