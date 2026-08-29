import { Given, When, Then, After } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import endpoints from '../lib/api/endpoints';
import { formatDate } from '../lib/utils/date-format';
import { logInfo, logVerify } from '../lib/logger';
import { createEmployeeViaApi } from '../support/actions';
import type { OrangeHrmWorld } from '../support/world';

/**
 * These steps change instance-wide settings, which is why the feature they
 * belong to runs alone. Every scenario records what it found first and an After
 * hook puts it back, so a failure half way through cannot leave the instance in
 * Spanish for whoever runs next.
 */
const setLocalization = async (
  world: OrangeHrmWorld,
  values: { language: string; dateFormat: string }
): Promise<void> => {
  const response = await world.api.send('PUT', endpoints.admin.localization, { data: values });
  expect(response.status(), 'Changing the instance localization').toBe(200);
};

Given(
  'the instance localization is recorded so it can be restored',
  async function (this: OrangeHrmWorld) {
    const { language, dateFormat } = await this.api.getLocalization();
    this.state.originalLocalization = { language, dateFormat };
    logInfo(`Instance localization before this scenario: ${language}, ${dateFormat}`);
  }
);

After({ tags: '@localization' }, async function (this: OrangeHrmWorld) {
  const original = this.state.originalLocalization;
  if (!original || !this.api) return;

  await setLocalization(this, original).catch(() => {});
  logInfo(`Instance localization restored to ${original.language}, ${original.dateFormat}`);
});

Given('an employee created through the API', async function (this: OrangeHrmWorld) {
  this.state.employee = await createEmployeeViaApi(this);
});

Given(
  'that employee has a date of birth of {string}',
  async function (this: OrangeHrmWorld, birthday: string) {
    const { response } = await this.api.updatePersonalDetails(this.state.employee.empNumber, {
      firstName: this.state.employee.firstName,
      middleName: this.state.employee.middleName || '',
      lastName: this.state.employee.lastName,
      employeeId: this.state.employee.employeeId,
      birthday
    });
    expect(response.status()).toBe(200);
    this.state.birthday = birthday;
  }
);

When(
  'the instance language is set to {string}',
  async function (this: OrangeHrmWorld, language: string) {
    await setLocalization(this, {
      language,
      dateFormat: this.state.originalLocalization.dateFormat
    });
  }
);

When(
  'the instance date format is set to {string}',
  async function (this: OrangeHrmWorld, dateFormat: string) {
    await setLocalization(this, {
      language: this.state.originalLocalization.language,
      dateFormat
    });
  }
);

/**
 * Read in a session with no cookie of its own.
 *
 * The scenario is signed in as an administrator - it has to be, to change the
 * setting - and an authenticated browser asking for /auth/login is redirected
 * straight to the dashboard, so the form never appears. A second, empty context
 * is the only place the login page renders as a signed-out user would see it.
 */
Then(
  'the sign-in button should read {string}',
  async function (this: OrangeHrmWorld, expected: string) {
    const session = await this.newIsolatedSession();
    this.state.labelSession = session;

    await session.pages.login.open(this.baseUrl);
    const label = (await session.pages.login.submitButtonLabel()).trim();

    logVerify(`Sign-in button reads "${label}", expected "${expected}"`);
    expect(label).toBe(expected);

    await session.context.close();
    this.state.labelSession = null;
  }
);

Then('the API should still return that employee unchanged', async function (this: OrangeHrmWorld) {
  const { response, body } = await this.api.getEmployee(this.state.employee.empNumber);

  expect(response.status()).toBe(200);
  expect(body.data.firstName).toBe(this.state.employee.firstName);
  expect(body.data.employeeId).toBe(this.state.employee.employeeId);
  logVerify('The record is unchanged - the language is presentation only');
});

Then(
  'the personal details screen should show the date of birth as {string}',
  async function (this: OrangeHrmWorld, rendered: string) {
    await this.pages.personalDetails.open(this.baseUrl, this.state.employee.empNumber);
    const shown = await this.pages.personalDetails.dateOfBirth();

    logVerify(`Stored ${this.state.birthday}, screen shows "${shown}", expected "${rendered}"`);
    expect(shown).toBe(rendered);
  }
);

Then(
  'the API should still report the date of birth as {string}',
  async function (this: OrangeHrmWorld, iso: string) {
    const { body } = await this.api.getPersonalDetails(this.state.employee.empNumber);

    logVerify(`API reports ${body.data.birthday}, expected ${iso}`);
    expect(body.data.birthday).toBe(iso);
    expect(formatDate(iso, 'Y-m-d')).toBe(iso);
  }
);
