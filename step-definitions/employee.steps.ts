import { When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { load } from '../lib/utils/data-helper';
import { formatDate } from '../lib/utils/date-format';
import { buildEmployee } from '../test-data/employee-factory';
import { createEmployeeViaApi } from '../support/actions';
import { logVerify, logInfo } from '../lib/logger';
import type { OrangeHrmWorld } from '../support/world';
import type { Employee } from '../lib/BasePage';

/** The fields of a PIM list row that the assertions below read. */
interface EmployeeRow {
  empNumber: number;
  firstName: string;
  lastName: string;
  employeeId: string;
}

When('I create a new employee through the PIM module', async function (this: OrangeHrmWorld) {
  const employee = buildEmployee();
  this.state.employee = employee;

  await this.pages.addEmployee.open(this.baseUrl);
  await this.pages.addEmployee.fillForm(employee);

  const empNumber = await this.pages.addEmployee.saveAndReturnEmployeeNumber();
  employee.empNumber = empNumber;
  this.created.employees.push(empNumber);

  logInfo(`Created employee ${employee.firstName} ${employee.lastName} (#${empNumber})`);
});

Then(
  'the employee should be saved and opened on the personal details screen',
  async function (this: OrangeHrmWorld) {
    const { employee } = this.state;

    await expect(this.page).toHaveURL(
      new RegExp(`pim/viewPersonalDetails/empNumber/${employee.empNumber}$`)
    );
    await this.pages.personalDetails.waitUntilLoaded();

    const shown = await this.pages.personalDetails.readDetails();
    expect(shown.firstName).toBe(employee.firstName);
    expect(shown.lastName).toBe(employee.lastName);
  }
);

Then('the API should return the same employee record', async function (this: OrangeHrmWorld) {
  const { employee } = this.state;
  const { response, body } = await this.api.getEmployee(employee.empNumber);

  expect(response.status()).toBe(200);
  expect(body.data).toMatchObject({
    empNumber: employee.empNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    employeeId: employee.employeeId
  });
  logVerify(`API confirms employee #${employee.empNumber}`);
});

When('I update the personal details of the employee', async function (this: OrangeHrmWorld) {
  const update = load('employees.json').personalDetailsUpdate;
  this.state.update = update;

  await this.pages.personalDetails.open(this.baseUrl, this.state.employee.empNumber);
  await this.pages.personalDetails.updateDetails(update);
  this.state.toast = await this.pages.personalDetails.savePersonalDetails();
});

Then('the update should be confirmed on screen', async function (this: OrangeHrmWorld) {
  expect(this.state.toast).toContain('Successfully Updated');
});

Then('the API should return the updated personal details', async function (this: OrangeHrmWorld) {
  const { employee, update } = this.state;
  const { response, body } = await this.api.getPersonalDetails(employee.empNumber);

  expect(response.status()).toBe(200);
  expect(body.data).toMatchObject({
    empNumber: employee.empNumber,
    otherId: update.otherId,
    drivingLicenseNo: update.drivingLicenseNo,
    birthday: update.birthday,
    gender: update.genderId
  });
  logVerify('API confirms the personal details update');
});

When('I delete the employee from the employee list', async function (this: OrangeHrmWorld) {
  const { employee } = this.state;

  await this.pages.employeeList.open(this.baseUrl);
  await this.pages.employeeList.searchByEmployeeId(employee.employeeId);
  await expect(this.pages.employeeList.rows).toHaveCount(1);

  const { status, toast } = await this.pages.employeeList.deleteFirstRow();
  expect(status).toBe(200);
  logVerify(`Delete returned ${status}${toast ? ` with toast "${toast}"` : ''}`);

  // The record is gone, so the After hook must not try to delete it again.
  this.created.employees = this.created.employees.filter((id) => id !== employee.empNumber);
});

Then('the employee should no longer be listed', async function (this: OrangeHrmWorld) {
  await this.pages.employeeList.searchByEmployeeId(this.state.employee.employeeId);
  await expect(this.pages.employeeList.rows).toHaveCount(0);
});

Then('the API should no longer return the employee', async function (this: OrangeHrmWorld) {
  const { response } = await this.api.getEmployee(this.state.employee.empNumber);

  // OrangeHRM answers 422 (not 404) for a deleted employee number - the record
  // no longer satisfies the route validation rule.
  expect([404, 422]).toContain(response.status());
  logVerify(`API rejects the deleted employee with ${response.status()}`);
});

When('I open the add employee screen', async function (this: OrangeHrmWorld) {
  await this.pages.addEmployee.open(this.baseUrl);
});

When('I save the employee form without filling it in', async function (this: OrangeHrmWorld) {
  await this.pages.addEmployee.save();
});

Then(
  'the first and last name fields should be flagged as required',
  async function (this: OrangeHrmWorld) {
    const messages = await this.pages.addEmployee.validationMessages();
    logVerify(`Validation messages: ${JSON.stringify(messages)}`);
    expect(messages).toContain('Required');
    expect(messages.filter((message) => message === 'Required').length).toBeGreaterThanOrEqual(2);
  }
);

When('I create an employee through the API', async function (this: OrangeHrmWorld) {
  this.state.employee = await createEmployeeViaApi(this);
});

When('I search for that employee in the employee list', async function (this: OrangeHrmWorld) {
  await this.pages.employeeList.open(this.baseUrl);
  await this.pages.employeeList.searchByEmployeeId(this.state.employee.employeeId);
});

Then('exactly one employee row should be listed', async function (this: OrangeHrmWorld) {
  // toHaveCount polls, so the assertion survives the Vue re-render that follows
  // the search response.
  await expect(this.pages.employeeList.rows).toHaveCount(1);
});

Then('the listed row should show the employee id and name', async function (this: OrangeHrmWorld) {
  const [row] = await this.pages.employeeList.rowTexts();
  const { employee } = this.state;

  expect(row).toContain(employee.employeeId);
  expect(row).toContain(employee.firstName);
  expect(row).toContain(employee.lastName);
});

When(
  'I update the personal details of that employee through the API',
  async function (this: OrangeHrmWorld) {
    const { employee } = this.state;
    const update = load('employees.json').personalDetailsUpdate;
    this.state.update = update;

    const { response } = await this.api.updatePersonalDetails(employee.empNumber, {
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
      employeeId: employee.employeeId,
      otherId: update.otherId,
      drivingLicenseNo: update.drivingLicenseNo,
      birthday: update.birthday,
      gender: update.genderId,
      maritalStatus: update.maritalStatus
    });

    expect(response.status()).toBe(200);
  }
);

Then(
  'the personal details screen should show the updated values',
  async function (this: OrangeHrmWorld) {
    const { employee, update } = this.state;

    await this.pages.personalDetails.open(this.baseUrl, employee.empNumber);
    const shown = await this.pages.personalDetails.readDetails();

    logVerify(`Personal details screen shows ${JSON.stringify(shown)}`);
    expect(shown).toMatchObject({
      firstName: employee.firstName,
      lastName: employee.lastName,
      otherId: update.otherId,
      drivingLicenseNo: update.drivingLicenseNo
    });
  }
);

/**
 * The date on screen is rendered with the instance wide localization setting,
 * not with the ISO format the API stores. That setting is part of the shared
 * demo's mutable state - it was `Y-d-m` one evening and `Y-m-d` the next
 * morning, which is exactly the kind of thing that makes a suite look flaky when
 * it is really asserting on somebody else's configuration.
 *
 * So the expected value is formatted the way the instance says it renders dates.
 */
Then(
  'the date of birth should be shown in the instance date format',
  async function (this: OrangeHrmWorld) {
    const { dateFormat } = await this.api.getLocalization();
    const expected = formatDate(this.state.update.birthday, dateFormat);
    const shown = await this.pages.personalDetails.readDetails();

    logVerify(
      `Stored ${this.state.update.birthday}; instance renders "${dateFormat}", so expecting ${expected}`
    );
    expect(shown.birthday).toBe(expected);
  }
);

When(
  'I search for that employee by name in the employee list',
  async function (this: OrangeHrmWorld) {
    const { employee } = this.state;
    const fullName = [employee.firstName, employee.middleName, employee.lastName]
      .filter(Boolean)
      .join(' ');

    await this.pages.employeeList.open(this.baseUrl);
    await this.pages.employeeList.searchByEmployeeName(fullName);
  }
);

When(
  'I try to create another employee with the same employee id',
  async function (this: OrangeHrmWorld) {
    const clash = buildEmployee({ employeeId: this.state.employee.employeeId });
    const { response, body } = await this.api.createEmployee(clash);

    this.state.lastApiResponse = response;
    this.state.lastApiBody = body;
  }
);

When('I reset the employee list filter', async function (this: OrangeHrmWorld) {
  await this.pages.employeeList.resetFilters();
});

Then('more than one employee row should be listed', async function (this: OrangeHrmWorld) {
  const count = await this.pages.employeeList.rowCount();
  logVerify(`Rows after resetting the filter: ${count}`);
  expect(count).toBeGreaterThan(1);
});

/**
 * Scoped to the filter, not to the whole table.
 *
 * The first version of this compared the unfiltered "(n) Records Found" with the
 * API's total. It passed locally and failed on CI, because the suite's own
 * parallel workers - and anyone else using the shared demo - create and delete
 * employees between the two reads. Comparing the two counts *for the same
 * filter*, on data the scenario just created, asks the same question about
 * something the scenario owns.
 */
Then(
  'the record count on screen should match the total the API reports for that filter',
  async function () {
    const onScreen = await this.pages.employeeList.recordCount();
    const { body } = await this.api.findEmployeeByName(this.state.employee);

    logVerify(`List shows ${onScreen} record(s), API reports ${body.meta.total}`);
    expect(onScreen).toBe(body.meta.total);
  }
);

When('I create {int} employees through the API', async function (this: OrangeHrmWorld, count) {
  // Deliberately the same name for all of them: OrangeHRM only requires the
  // employee id to be unique, and a shared name is what lets one search return
  // the whole set for the bulk delete.
  const shared = buildEmployee();
  this.state.employees = [];

  for (let index = 0; index < count; index += 1) {
    this.state.employees.push(
      await createEmployeeViaApi(this, {
        firstName: shared.firstName,
        middleName: shared.middleName,
        lastName: shared.lastName
      })
    );
  }

  this.state.employee = this.state.employees[0];
  logInfo(`Created ${count} employees sharing the name ${shared.firstName} ${shared.lastName}`);
});

When(
  'I search for those employees by their shared name prefix',
  async function (this: OrangeHrmWorld) {
    const [first] = this.state.employees;
    const fullName = [first.firstName, first.middleName, first.lastName].filter(Boolean).join(' ');

    await this.pages.employeeList.open(this.baseUrl);
    await this.pages.employeeList.searchByEmployeeName(fullName, { pickSuggestion: false });
    await expect(this.pages.employeeList.rows).toHaveCount(this.state.employees.length);
  }
);

When('I delete all the listed employees in one action', async function (this: OrangeHrmWorld) {
  const { status } = await this.pages.employeeList.deleteSelectedRows(this.state.employees.length);
  expect(status).toBe(200);

  const removed = this.state.employees.map((employee: Employee) => employee.empNumber);
  this.created.employees = this.created.employees.filter((id) => !removed.includes(id));
});

Then('no employee rows should be listed', async function (this: OrangeHrmWorld) {
  await expect(this.pages.employeeList.rows).toHaveCount(0);
});

Then('the API should no longer return any of them', async function (this: OrangeHrmWorld) {
  for (const employee of this.state.employees) {
    const { response } = await this.api.getEmployee(employee.empNumber);
    expect([404, 422]).toContain(response.status());
  }
});

When('I save contact details for that employee in the UI', async function (this: OrangeHrmWorld) {
  const details = load('employees.json').contactDetailsUpdate;
  this.state.contact = details;

  await this.pages.contactDetails.open(this.baseUrl, this.state.employee.empNumber);
  await this.pages.contactDetails.fillContactDetails(details);

  const { status } = await this.pages.contactDetails.save();
  expect(status).toBe(200);
});

Then('the API should return the same contact details', async function (this: OrangeHrmWorld) {
  const { response, body } = await this.api.getContactDetails(this.state.employee.empNumber);
  const expected = this.state.contact;

  expect(response.status()).toBe(200);
  expect(body.data).toMatchObject({
    street1: expected.street1,
    city: expected.city,
    zipCode: expected.postcode,
    mobile: expected.mobile,
    workEmail: expected.workEmail
  });
  logVerify('API confirms the contact details');
});

When('I delete the employee through the API', async function (this: OrangeHrmWorld) {
  const { response } = await this.api.deleteEmployees([this.state.employee.empNumber]);
  expect(response.status()).toBe(200);

  this.created.employees = this.created.employees.filter(
    (id) => id !== this.state.employee.empNumber
  );
});

When(
  'I try to create an employee without a {string}',
  async function (this: OrangeHrmWorld, field: keyof Employee) {
    const employee: Partial<Employee> = buildEmployee();
    delete employee[field];

    const { response, body } = await this.api.createEmployee(employee as Employee);
    this.state.lastApiResponse = response;
    this.state.lastApiBody = body;
  }
);

/**
 * Paginates a filtered result the scenario created, not the whole table.
 *
 * The first version asked for page one and page two of every employee. It passed
 * alone and overlapped under parallel load, because this suite's own workers -
 * and anyone else on the shared demo - insert and delete rows between the two
 * requests, which shifts every offset. Scoping the query to three records the
 * scenario just created makes the dataset stable without weakening what is being
 * asserted.
 */
When('I ask the API for the first {int} of them', async function (this: OrangeHrmWorld, limit) {
  const nameOrId = this.state.employees[0].firstName;
  const { body } = await this.api.listEmployees({ limit, offset: 0, nameOrId });

  this.state.pageSize = limit;
  this.state.nameOrId = nameOrId;
  this.state.firstPage = body;
});

Then(
  'it should report a total of {int} and return {int} of them',
  async function (this: OrangeHrmWorld, total, size) {
    const { firstPage } = this.state;

    logVerify(`Page of ${firstPage.data.length}, total ${firstPage.meta.total}`);
    expect(firstPage.meta.total).toBe(total);
    expect(firstPage.data.length).toBe(size);
  }
);

Then(
  'the second page should hold the remaining one, with no overlap',
  async function (this: OrangeHrmWorld) {
    const { body } = await this.api.listEmployees({
      limit: this.state.pageSize,
      offset: this.state.pageSize,
      nameOrId: this.state.nameOrId
    });

    const firstIds = this.state.firstPage.data.map((row: EmployeeRow) => row.empNumber);
    const secondIds = body.data.map((row: EmployeeRow) => row.empNumber);

    logVerify(`Page one ${JSON.stringify(firstIds)}, page two ${JSON.stringify(secondIds)}`);
    expect(secondIds.length).toBe(1);
    expect(secondIds.filter((id: number) => firstIds.includes(id))).toEqual([]);
  }
);
