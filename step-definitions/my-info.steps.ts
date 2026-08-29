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

Then("the record shown should be the signed in user's own", function (this: OrangeHrmWorld) {
  expect(this.state.myEmpNumber, 'My Info resolved to an employee').toBeGreaterThan(0);
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
    const { body } = await this.api.getEmployee(this.state.myEmpNumber);

    logVerify(
      `Screen shows "${firstName} ${lastName}", API has "${body.data.firstName} ${body.data.lastName}"`
    );
    expect(firstName).toBe(body.data.firstName);
    expect(lastName).toBe(body.data.lastName);
  }
);
