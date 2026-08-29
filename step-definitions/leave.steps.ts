import { When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { logVerify } from '../lib/logger';
import type { OrangeHrmWorld } from '../support/world';

When('I open the leave list', async function (this: OrangeHrmWorld) {
  await this.pages.leaveList.open(this.baseUrl);
});

Then(
  'the leave list should offer the filters',
  async function (this: OrangeHrmWorld, table: DataTable) {
    const expected = table.hashes().map((row) => row.filter);

    for (const filter of expected) {
      await expect(this.page.getByText(filter, { exact: true }).first()).toBeVisible();
    }

    logVerify(`Leave list offers: ${expected.join(', ')}`);
  }
);

/**
 * A dropdown that has drifted from the data behind it is a real and easily
 * missed defect - the user picks something the system no longer has, or never
 * sees something it does. Comparing the two lists is cheap and catches it.
 */
Then(
  'the leave types in the filter should match the ones the API returns',
  async function (this: OrangeHrmWorld) {
    const onScreen = await this.pages.leaveList.leaveTypeOptions();
    const { body } = await this.api.listLeaveTypes();
    const fromApi = body.data.map((type: { name: string }) => type.name);

    logVerify(`Screen offers ${onScreen.length} leave types, API returns ${fromApi.length}`);
    expect([...onScreen].sort()).toEqual([...fromApi].sort());
  }
);
