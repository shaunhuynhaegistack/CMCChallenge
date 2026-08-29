import { When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { selectors } from '../lib/BasePage';
import { logVerify } from '../lib/logger';
import type { OrangeHrmWorld } from '../support/world';

const MY_INFO = '/web/index.php/pim/viewMyDetails';

/**
 * My Info redirects to the personal details route of whichever employee the
 * signed in account belongs to, so the employee number is discovered from where
 * the application lands rather than assumed.
 */
When('I open My Info', async function (this: OrangeHrmWorld) {
  await this.pages.modules.navigateTo(`${this.baseUrl}${MY_INFO}`);
  await this.page.waitForURL('**/viewPersonalDetails/empNumber/**');
  await this.pages.personalDetails.waitUntilLoaded();

  const [, empNumber] = this.page.url().match(/empNumber\/(\d+)/) || [];
  this.state.myEmpNumber = Number(empNumber);
  logVerify(`My Info resolved to employee #${this.state.myEmpNumber}`);
});

Then('the personal details screen should be shown', async function (this: OrangeHrmWorld) {
  await expect(this.page).toHaveURL(/viewPersonalDetails/);
});

/**
 * Compared against the record the server says belongs to this session, not
 * merely against "some employee". A redirect to any valid record would satisfy
 * the weaker check and prove nothing.
 */
Then("the record shown should be the signed in user's own", async function (this: OrangeHrmWorld) {
  const { body } = await this.api.getMyself();

  logVerify(
    `My Info opened #${this.state.myEmpNumber}; the session belongs to #${body.data.empNumber}`
  );
  expect(this.state.myEmpNumber).toBe(body.data.empNumber);
});

Then(
  'the record should offer these sections',
  async function (this: OrangeHrmWorld, table: DataTable) {
    const expected = table.raw().map(([name]) => name);
    const shown = (await this.page.locator(selectors.recordTab).allInnerTexts()).map((text) =>
      text.trim()
    );

    logVerify(`Record offers ${JSON.stringify(shown)}`);
    expect(shown).toEqual(expect.arrayContaining(expected));
  }
);

Then(
  'the name on screen should match the API record for that employee',
  async function (this: OrangeHrmWorld) {
    const { firstName, lastName } = await this.pages.personalDetails.readDetails();
    const { body } = await this.api.getMyself();

    logVerify(
      `Screen shows "${firstName} ${lastName}", API has "${body.data.firstName} ${body.data.lastName}"`
    );
    expect(firstName).toBe(body.data.firstName);
    expect(lastName).toBe(body.data.lastName);
  }
);
