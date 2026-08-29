import { Given, When, Then } from '@cucumber/cucumber';
import type { OrangeHrmWorld } from '../support/world';
import { expect } from '@playwright/test';
import { load } from '../lib/utils/data-helper';
import { buildEmployee } from '../test-data/employee-factory';
import { provisionAccount, signInAsInSeparateSession } from '../support/actions';
import { logVerify } from '../lib/logger';

/**
 * The account used by the role scenarios is a precondition, not the thing under
 * test, so it is provisioned through the API. Driving the Admin > Add User form
 * for setup would add an autocomplete-heavy UI flow to a scenario that is really
 * about what the ESS role can reach.
 */
Given(
  'an employee with an {string} account exists',
  async function (this: OrangeHrmWorld, roleName) {
    const { employee, account, role } = await provisionAccount(this, roleName);

    this.state.employee = employee;
    this.state.account = account;
    this.state.role = role;
  }
);

Then(
  'the ESS account is listed under Admin - User Management',
  async function (this: OrangeHrmWorld) {
    await this.pages.adminUsers.open(this.baseUrl);
    await this.pages.adminUsers.searchByUsername(this.state.account.username);

    await expect(this.pages.adminUsers.rows).toHaveCount(1);

    const [row] = await this.pages.adminUsers.rowTexts();
    expect(row).toContain(this.state.account.username);
    expect(row).toContain('ESS');
  }
);

When('that user signs in from a separate session', async function (this: OrangeHrmWorld) {
  this.state.essSession = await signInAsInSeparateSession(this, this.state.account);
});

Then(
  'the side menu should contain the modules for the {string} role',
  async function (this: OrangeHrmWorld, roleName) {
    const role = load('roles.json')[roleName];
    const pages = this.state.essSession ? this.state.essSession.pages : this.pages;

    const modules = await pages.dashboard.sideMenu.moduleNames();
    logVerify(`Modules visible to ${roleName}: ${JSON.stringify(modules)}`);

    role.expectedModules.forEach((module: string) => expect(modules).toContain(module));
  }
);

Then(
  'the side menu should not contain the modules forbidden for the {string} role',
  async function (roleName) {
    const role = load('roles.json')[roleName];
    const pages = this.state.essSession ? this.state.essSession.pages : this.pages;

    const modules = await pages.dashboard.sideMenu.moduleNames();
    role.forbiddenModules.forEach((module: string) => expect(modules).not.toContain(module));
  }
);

Then(
  'the admin users API should reject the request with status {int}',
  async function (this: OrangeHrmWorld, status) {
    const { response } = await this.state.essSession.api.listAdminUsers();
    logVerify(`ESS session hitting the admin users API returned ${response.status()}`);
    expect(response.status()).toBe(status);
  }
);

Then(
  'opening the admin page directly should be refused with status {int}',
  async function (status) {
    const { pages } = this.state.essSession;
    const response = await pages.adminUsers.openAndReturnResponse(
      `${this.baseUrl}${pages.adminUsers.path}`
    );

    // OrangeHRM answers 403 with an empty body, so the status is the assertion -
    // there is no error page to read.
    logVerify(`ESS session opening the admin page returned ${response.status()}`);
    expect(response.status()).toBe(status);
  }
);

When('an unauthenticated client calls the employees API', async function (this: OrangeHrmWorld) {
  const anonymous = await this.newAnonymousApi();
  const { response } = await anonymous.listEmployees({ limit: 1 });
  this.state.lastApiResponse = response;
});

/**
 * Read and write are separate permissions here, and the interesting assertion is
 * that they differ: an ESS user is meant to see the directory and not to edit it.
 * Asserting "403 on everything" would have been wrong - and was, in the first
 * version of this scenario.
 */
Then(
  'that session should be allowed to read the employee list',
  async function (this: OrangeHrmWorld) {
    const { response } = await this.state.essSession.api.listEmployees({ limit: 1 });
    logVerify(`ESS reading the employee list returned ${response.status()}`);
    expect(response.status()).toBe(200);
  }
);

Then(
  'that session should be refused when it tries to create an employee',
  async function (this: OrangeHrmWorld) {
    const { response } = await this.state.essSession.api.createEmployee(buildEmployee());
    logVerify(`ESS creating an employee returned ${response.status()}`);
    expect(response.status()).toBe(403);
  }
);

Then('that user should be able to open My Info', async function (this: OrangeHrmWorld) {
  const { page, pages } = this.state.essSession;

  await pages.dashboard.sideMenu.openModule('My Info');

  // The screen an ESS user lands on is their own personal details record, so the
  // form itself is the assertion rather than a particular route. It is populated
  // by its own request after rendering, which is what waitUntilLoaded covers.
  await expect(page).toHaveURL(/\/pim\//);
  await pages.personalDetails.waitUntilLoaded();

  const name = await page.locator('input[name="firstName"]').inputValue();
  logVerify(`My Info opened on the record for "${name}"`);
  expect(name).toBe(this.state.employee.firstName);
});
