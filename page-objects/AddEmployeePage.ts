import type { Locator, Page } from '@playwright/test';
import BasePage from '../lib/BasePage';
import type { Employee } from '../lib/types';
import selectors from '../lib/selectors';

export class AddEmployeePage extends BasePage {
  readonly path: string;

  readonly firstName: Locator;

  readonly middleName: Locator;

  readonly lastName: Locator;

  readonly employeeId: Locator;

  readonly saveButton: Locator;

  readonly requiredErrors: Locator;

  constructor(page: Page) {
    super(page);

    this.path = '/web/index.php/pim/addEmployee';
    this.firstName = page.locator('input[name="firstName"]');
    this.middleName = page.locator('input[name="middleName"]');
    this.lastName = page.locator('input[name="lastName"]');
    this.employeeId = page
      .locator(selectors.inputGroup)
      .filter({ hasText: 'Employee Id' })
      .locator('input');
    this.saveButton = page.getByRole('button', { name: 'Save' });
    this.requiredErrors = page.locator(selectors.fieldError);
  }

  async open(baseUrl: string) {
    await this.navigateTo(`${baseUrl}${this.path}`);
    await this.firstName.waitFor({ state: 'visible' });
  }

  async fillForm(employee: Employee) {
    await this.type(this.firstName, employee.firstName, 'First Name');
    if (employee.middleName) {
      await this.type(this.middleName, employee.middleName, 'Middle Name');
    }
    await this.type(this.lastName, employee.lastName, 'Last Name');
    await this.type(this.employeeId, employee.employeeId, 'Employee Id');
  }

  async save() {
    await this.click(this.saveButton, 'Save');
  }

  /**
   * Saving redirects to the personal details screen; the employee number is only
   * available from that URL, so we return it for the API assertions later on.
   */
  async saveAndReturnEmployeeNumber() {
    await this.save();
    await this.page.waitForURL('**/pim/viewPersonalDetails/empNumber/**');
    const empNumber = Number(this.page.url().split('/').pop());
    if (!Number.isInteger(empNumber)) {
      throw new Error(`Could not read the employee number from ${this.page.url()}`);
    }
    return empNumber;
  }

  async validationMessages() {
    await this.requiredErrors.first().waitFor({ state: 'visible' });
    return (await this.requiredErrors.allInnerTexts()).map((text) => text.trim());
  }
}

export default AddEmployeePage;
