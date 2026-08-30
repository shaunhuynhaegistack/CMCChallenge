import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { logVerify } from '../lib/logger';
import type { OrangeHrmWorld } from '../support/world';
import { ensureAuthScreenLanguage } from '../support/actions';

Given('I am on the password reset page', async function (this: OrangeHrmWorld) {
  await this.pages.passwordReset.open(this.baseUrl);
  await ensureAuthScreenLanguage(this, this.pages.passwordReset);
});

When('I go back to the password reset page', async function (this: OrangeHrmWorld) {
  await this.pages.passwordReset.open(this.baseUrl);
});

/**
 * A username built the same way the employee factory builds one, so it is
 * certainly absent rather than merely unlikely.
 */

When('I submit the reset form without a username', async function (this: OrangeHrmWorld) {
  await this.pages.passwordReset.submitWithoutUsername();
});

When('I cancel the password reset', async function (this: OrangeHrmWorld) {
  await this.pages.passwordReset.cancel();
});

Then(
  'the reset screen should be titled {string}',
  async function (this: OrangeHrmWorld, expected: string) {
    const heading = await this.pages.passwordReset.headingText();

    logVerify(`Reset screen heading is "${heading}"`);
    expect(heading).toBe(expected);
  }
);

Then(
  'the reset screen should offer a {string} field',
  async function (this: OrangeHrmWorld, label: string) {
    const shown = await this.pages.passwordReset.usernameFieldLabel();

    logVerify(`Reset screen field is labelled "${shown}"`);
    expect(shown).toContain(label);
  }
);

Then(
  'the reset screen should offer the buttons {string} and {string}',
  async function (this: OrangeHrmWorld, first: string, second: string) {
    const labels = await this.pages.passwordReset.buttonLabels();

    logVerify(`Reset screen offers ${JSON.stringify(labels)}`);
    expect(labels).toEqual(expect.arrayContaining([first, second]));
  }
);

/**
 * The one assertion on this screen that is about security rather than
 * behaviour. If the wording differs between a username that exists and one that
 * does not, the screen answers "does this account exist?" for anybody who asks.
 */

Then('the username field should be flagged as required', async function (this: OrangeHrmWorld) {
  const errors = await this.pages.passwordReset.fieldErrorMessages();

  logVerify(`Field errors: ${JSON.stringify(errors)}`);
  expect(errors).toContain('Required');
});

Then('I should stay on the password reset page', async function (this: OrangeHrmWorld) {
  expect(this.page.url()).toContain(this.pages.passwordReset.path);
});

Then('I should be back on the login page', async function (this: OrangeHrmWorld) {
  expect(this.page.url()).toContain(this.pages.login.path);
});

When('I go to the login page', async function (this: OrangeHrmWorld) {
  await this.pages.login.open(this.baseUrl);
});
