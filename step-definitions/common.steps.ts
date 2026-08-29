import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { logVerify } from '../lib/logger';
import type { OrangeHrmWorld } from '../support/world';

/**
 * Shared across the API scenarios: whatever the last API call was, this asserts
 * the status it came back with. `this.api.lastResponse` is set by every call the
 * client makes, so the step reads naturally after any of them.
 */
Then('the API should reject it with status {int}', async function (this: OrangeHrmWorld, status) {
  const response = this.state.lastApiResponse || this.api.lastResponse;
  logVerify(`Expected status ${status}, got ${response.status()}`);
  expect(response.status()).toBe(status);
});

/**
 * OrangeHRM answers a rejected write with the field it objected to, which is a
 * far better assertion than "it returned 422" - the same status covers a
 * duplicate id, a missing name and a malformed email.
 */
Then(
  'the rejection should name {string} as the invalid parameter',
  async function (this: OrangeHrmWorld, field) {
    const body = this.state.lastApiBody;
    logVerify(`Rejection payload: ${JSON.stringify(body)}`);
    expect(body?.error?.data?.invalidParamKeys).toContain(field);
  }
);
