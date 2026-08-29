import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import endpoints from '../lib/api/endpoints';
import { uniqueSuffix } from '../test-data/employee-factory';
import { logVerify } from '../lib/logger';
import type { OrangeHrmWorld } from '../support/world';

/**
 * The account these scenarios work with is provisioned by the shared step in
 * role-based-access.steps.ts - "an employee with an {string} account exists" -
 * so there is one way to create one and one place that registers it for
 * teardown.
 */

Given('I open the system users screen', async function (this: OrangeHrmWorld) {
  await this.pages.adminUsers.open(this.baseUrl);
});

Then(
  'the user list should offer the filters',
  async function (this: OrangeHrmWorld, table: DataTable) {
    const expected = table.raw().map(([label]) => label);
    const offered = await this.pages.adminUsers.filterLabels();

    logVerify(`The filter panel offers ${JSON.stringify(offered)}`);
    expect(offered).toEqual(expect.arrayContaining(expected));
  }
);

Then(
  'the user list should report how many records it found',
  async function (this: OrangeHrmWorld) {
    const count = await this.pages.adminUsers.recordCount();

    logVerify(`User list reports ${count} records`);
    expect(count, 'the record count label').not.toBeNull();
    expect(count as number).toBeGreaterThan(0);
  }
);

When('I search the user list for that account', async function (this: OrangeHrmWorld) {
  await this.pages.adminUsers.searchByUsername(this.state.account.username);
  this.state.filteredCount = await this.pages.adminUsers.rowCount();
});

When(
  'I search the user list for a user name that does not exist',
  async function (this: OrangeHrmWorld) {
    await this.pages.adminUsers.searchByUsername(`absent_${uniqueSuffix()}`);
  }
);

When('I reset the user list filter', async function (this: OrangeHrmWorld) {
  await this.pages.adminUsers.resetFilters();
});

Then('exactly one account should be listed', async function (this: OrangeHrmWorld) {
  const rows = await this.pages.adminUsers.rowCount();

  logVerify(`Filtered user list shows ${rows} row(s)`);
  expect(rows).toBe(1);
});

Then(
  'the listed account should be the one that was created',
  async function (this: OrangeHrmWorld) {
    const [row] = await this.pages.adminUsers.rowTexts();

    logVerify(`Row reads "${row}"`);
    expect(row).toContain(this.state.account.username);
  }
);

Then('no accounts should be listed', async function (this: OrangeHrmWorld) {
  const rows = await this.pages.adminUsers.rowCount();

  logVerify(`A user name that does not exist returned ${rows} row(s)`);
  expect(rows).toBe(0);
});

/**
 * Compared against what the filter returned rather than against a fixed number:
 * the instance is shared, so the size of the full list is not ours to predict.
 */
Then(
  'more accounts should be listed than the filter returned',
  async function (this: OrangeHrmWorld) {
    const rows = await this.pages.adminUsers.rowCount();

    logVerify(`Filtered: ${this.state.filteredCount} row(s); after reset: ${rows}`);
    expect(rows).toBeGreaterThan(this.state.filteredCount);
  }
);

When(
  'I try to create a second account with the same user name',
  async function (this: OrangeHrmWorld) {
    const { response, body } = await this.api.createUser({
      username: this.state.account.username,
      password: this.state.account.password,
      userRoleId: this.state.account.userRoleId,
      empNumber: this.state.account.empNumber
    });

    this.state.lastApiResponse = response;
    this.state.lastApiBody = body;
  }
);

Then('the API should reject it as a duplicate', function (this: OrangeHrmWorld) {
  const status = this.state.lastApiResponse.status();

  logVerify(`Creating a duplicate user name returned ${status}`);
  expect(status).toBe(422);
});

When('I delete that account from the list', async function (this: OrangeHrmWorld) {
  this.state.deletion = await this.pages.adminUsers.deleteOnlyRowMatching(
    this.state.account.username
  );
});

Then('the deletion should be confirmed', function (this: OrangeHrmWorld) {
  logVerify(
    `Delete returned ${this.state.deletion.status} with toast "${this.state.deletion.toast}"`
  );
  expect(this.state.deletion.status).toBe(200);
});

Then('the API should no longer return that account', async function (this: OrangeHrmWorld) {
  const { body } = await this.api
    .send('GET', `${endpoints.admin.users}?limit=50&offset=0`)
    .then(async (response) => ({ body: await this.api.json(response) }));
  const found = (body?.data || []).some(
    (row: { userName: string }) => row.userName === this.state.account.username
  );

  logVerify(`The deleted account is ${found ? 'still' : 'no longer'} in the API listing`);
  expect(found).toBe(false);

  // Already gone, so the After hook must not try again and log a failure.
  this.created.users = this.created.users.filter((id) => id !== this.state.account.id);
});
