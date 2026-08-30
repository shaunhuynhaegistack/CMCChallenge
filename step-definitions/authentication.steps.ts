import { Given, When, Then } from '@cucumber/cucumber';
import type { OrangeHrmWorld } from '../support/world';
import { expect } from '@playwright/test';
import { resolveUser } from '../lib/utils/data-helper';
import { signIn, ensureAuthScreenLanguage } from '../support/actions';
import { logVerify, logInfo } from '../lib/logger';

Given('I am on the OrangeHRM login page', async function (this: OrangeHrmWorld) {
  await this.pages.login.open(this.baseUrl);
  await expect(this.page).toHaveURL(/auth\/login/);
  await ensureAuthScreenLanguage(this, this.pages.login);
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

/**
 * The route is the assertion, not the heading.
 *
 * The breadcrumb reads "Dashboard" in English and "Pizarra de pendientes" in
 * Spanish, and the display language is an instance-wide setting that this suite
 * has watched change under a running scenario. What proves the sign-in worked
 * is that the browser is on the dashboard route with the module chrome
 * rendered - both of which are true in any language.
 */
Then('I should land on the dashboard', async function (this: OrangeHrmWorld) {
  await this.pages.dashboard.waitUntilLoaded();
  await expect(this.page).toHaveURL(/dashboard\/index/);
  await expect(this.pages.dashboard.topBar.moduleTitle).toBeVisible();
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
    // Kept for the scenario that compares two rejections with each other.
    this.state.lastAlert = message;

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

When('I note the rejection message', function (this: OrangeHrmWorld) {
  this.state.firstRejection = this.state.lastAlert;
});

/**
 * Two different reasons to refuse - no such user, and the wrong password - must
 * produce one message. A screen that distinguishes them answers "does this
 * account exist?" for anybody willing to ask twice.
 */
Then('the rejection message should be identical', function (this: OrangeHrmWorld) {
  logVerify(
    `An unknown account was told "${this.state.firstRejection}"; ` +
      `a real account with the wrong secret was told "${this.state.lastAlert}"`
  );
  expect(this.state.lastAlert).toBe(this.state.firstRejection);
});

Then('the session cookie should be flagged HttpOnly', async function (this: OrangeHrmWorld) {
  const cookies = await this.context.cookies();
  const session = cookies.find((cookie) => cookie.name.startsWith('orangehrm'));

  logVerify(`Session cookie ${session?.name} httpOnly=${session?.httpOnly}`);
  expect(session, 'a session cookie was set').toBeTruthy();
  expect(session?.httpOnly, 'the session cookie is not readable from script').toBe(true);
});

When('I go back in the browser history', async function (this: OrangeHrmWorld) {
  await this.page.goBack();
  logVerify(`The back button landed on ${this.page.url()}`);
});

/**
 * What the back button restores is the browser's own copy, so nothing it shows
 * says anything about the session. Two things are asserted instead, and neither
 * is a navigation this step performs.
 *
 * The browser arrives at the login form on its own, and how it gets there
 * differs by engine: Chromium redraws the dashboard from its cache and then
 * leaves once the page finds the session gone, while Firefox never restores it
 * at all. Driving a reload or a navigation into either of those transitions is
 * aborted by the browser - NS_BINDING_ABORTED on one engine, ERR_ABORTED on the
 * other - and the scenario then fails on the very redirect it is waiting for.
 * Both engines were observed doing this. So the browser is waited on, not
 * pushed.
 *
 * That leaves a URL, which is still the browser's decision. The assertion that
 * matters is the server's: the same address, asked for with the same cookies,
 * has to be refused.
 */
Then(
  'the signed out session cannot open the dashboard again',
  async function (this: OrangeHrmWorld) {
    await this.page.waitForURL(/auth\/login/);
    logVerify(`The browser settled on ${this.page.url()}`);

    const protectedUrl = `${this.baseUrl}${this.pages.dashboard.path}`;
    const response = await this.context.request.get(protectedUrl, { maxRedirects: 0 });

    logVerify(`Asking for the dashboard again returned ${response.status()}`);
    expect(response.status(), 'a signed out session is still served the dashboard').toBe(302);
    expect(
      response.headers().location,
      'the refusal does not send the browser to the login form'
    ).toMatch(/auth\/login/);
  }
);
