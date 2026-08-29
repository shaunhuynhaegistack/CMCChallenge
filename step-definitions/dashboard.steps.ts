import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { logVerify } from '../lib/logger';
import type { OrangeHrmWorld } from '../support/world';

Then(
  'the dashboard should show at least {int} widgets',
  async function (this: OrangeHrmWorld, minimum) {
    const titles = await this.pages.dashboard.widgetTitles();
    logVerify(`Dashboard widgets: ${JSON.stringify(titles)}`);
    expect(titles.length).toBeGreaterThanOrEqual(minimum);
  }
);

Then('the widgets should include {string}', async function (this: OrangeHrmWorld, name) {
  const titles = await this.pages.dashboard.widgetTitles();
  expect(titles).toContain(name);
});

/**
 * One scenario rather than a Scenario Outline: nine outline rows would be nine
 * browser sessions for what is really one question - does the navigation work.
 *
 * The assertion is on the route the module lands on, not on the heading. The
 * breadcrumb renders differently per module - some screens show only the module,
 * some show the module and the screen inside it, and a few render neither until
 * their first request comes back - whereas the route is the same contract the
 * application's own links rely on.
 */
Then(
  'each of these modules should open from the side menu',
  async function (this: OrangeHrmWorld, table) {
    const expected = table.hashes();
    const visited = [];

    for (const { module, 'lands on': path } of expected) {
      await this.pages.dashboard.sideMenu.openModule(module);
      await this.page.waitForURL(new RegExp(path.replace(/\//g, '\\/')));

      const url = this.page.url();
      logVerify(`"${module}" opened ${url}`);
      visited.push({ module, path, url });
    }

    visited.forEach(({ module, path, url }) => {
      expect(url, `Opening ${module} landed on ${url}`).toContain(path);
    });
  }
);
