import { Given, When, Then } from '@cucumber/cucumber';
import type { OrangeHrmWorld } from '../support/world';
import { expect } from '@playwright/test';
import { resolveUser } from '../lib/utils/data-helper';
import { signIn } from '../support/actions';
import { logVerify, logInfo } from '../lib/logger';

Given('I am on the OrangeHRM login page', async function (this: OrangeHrmWorld) {
  await this.pages.login.open(this.baseUrl);
  await expect(this.page).toHaveURL(/auth\/login/);
});

When('I sign in as {string}', async function (this: OrangeHrmWorld, userKey) {
  const user = resolveUser(userKey);
  logInfo(`Signing in as ${userKey} - ${user.description}`);
  this.state.user = user;
  await this.pages.login.login(user.username, user.password);
});

/**
 * Composite precondition for the feature files that are not about authentication
 * itself, so no Background has to repeat two steps. The work is in
 * support/actions.ts, which is also what the role scenarios use for their second
 * session - one sign-in implementation, not two.
 */
Given('I am signed in as {string}', async function (this: OrangeHrmWorld, userKey) {
  await signIn(this, userKey);
});

Then('I should land on the dashboard', async function (this: OrangeHrmWorld) {
  await this.pages.dashboard.waitUntilLoaded();
  await expect(this.page).toHaveURL(/dashboard\/index/);
  await expect(this.pages.dashboard.topBar.moduleTitle).toHaveText('Dashboard');
});

Then('the top bar should show the logged in user', async function (this: OrangeHrmWorld) {
  const displayName = await this.pages.dashboard.topBar.loggedInUser();
  logVerify(`Top bar shows "${displayName}"`);
  expect(displayName.length).toBeGreaterThan(0);
});

Then(
  'I should see the login alert {string}',
  async function (this: OrangeHrmWorld, expectedMessage) {
    const message = await this.pages.login.alertMessage();
    logVerify(`Login alert: expected "${expectedMessage}", actual "${message}"`);
    expect(message).toBe(expectedMessage);
  }
);

Then('I should stay on the login page', async function (this: OrangeHrmWorld) {
  await expect(this.page).toHaveURL(/auth\/login/);
});

Then('both credential fields should be flagged as required', async function (this: OrangeHrmWorld) {
  const errors = await this.pages.login.fieldErrorMessages();
  logVerify(`Field level errors: ${JSON.stringify(errors)}`);
  expect(errors).toEqual(['Required', 'Required']);
});

When('I sign out', async function (this: OrangeHrmWorld) {
  await this.pages.dashboard.waitUntilLoaded();
  await this.pages.dashboard.topBar.logout();
  await this.page.waitForURL('**/auth/login');
});

When('I open the employee list URL directly', async function (this: OrangeHrmWorld) {
  await this.page.goto(this.url('/web/index.php/pim/viewEmployeeList'), {
    waitUntil: 'domcontentloaded'
  });
});

Then('the page should be titled {string}', async function (this: OrangeHrmWorld, title) {
  await expect(this.page).toHaveTitle(title);
});

Then('the login branding should be visible', async function (this: OrangeHrmWorld) {
  await expect(this.pages.login.brandingLogo).toBeVisible();
});

Then('the password field should hide what is typed into it', async function (this: OrangeHrmWorld) {
  await this.pages.login.type(this.pages.login.password, 'not-a-real-password', 'password');
  // The input type is what actually hides the value; asserting on it is stronger
  // than asserting on how it looks.
  await expect(this.pages.login.password).toHaveAttribute('type', 'password');
});

When('I follow the forgotten password link', async function (this: OrangeHrmWorld) {
  await this.pages.login.openPasswordReset();
});

Then('I should be taken to the password reset page', async function (this: OrangeHrmWorld) {
  await expect(this.page).toHaveURL(/auth\/requestPasswordResetCode/);
});

Then(
  'only the password field should be flagged as required',
  async function (this: OrangeHrmWorld) {
    const errors = await this.pages.login.fieldErrorMessages();
    logVerify(`Field level errors: ${JSON.stringify(errors)}`);
    expect(errors).toEqual(['Required']);
  }
);
