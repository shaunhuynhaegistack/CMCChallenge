import type { Locator, Page } from '@playwright/test';
import FilterableListPage from './FilterableListPage';
import { selectors } from '../lib/BasePage';

export class EmployeeListPage extends FilterableListPage {
  readonly employeeNameFilter: Locator;

  readonly employeeIdFilter: Locator;

  readonly autocompleteOptions: Locator;

  constructor(page: Page) {
    super(page, {
      path: '/web/index.php/pim/viewEmployeeList',
      listApiPath: '/api/v2/pim/employees'
    });

    this.employeeNameFilter = this.fieldByLabel('Employee Name');
    this.employeeIdFilter = this.fieldByLabel('Employee Id');
    this.autocompleteOptions = page.locator(selectors.autocompleteOption);
  }

  async searchByEmployeeId(employeeId: string) {
    await this.type(this.employeeIdFilter, employeeId, 'Employee Id filter');
    return this.search();
  }

  /**
   * Picking a suggestion binds the filter to that one employee. Leaving the
   * typed text alone searches by name instead, which is what you want when more
   * than one person shares a name.
   */
  async searchByEmployeeName(fullName: string, { pickSuggestion = true } = {}) {
    await this.type(this.employeeNameFilter, fullName, 'Employee Name filter');

    if (pickSuggestion) {
      const option = this.autocompleteOptions.filter({ hasText: fullName }).first();
      await option.waitFor({ state: 'visible' });
      await this.click(option, `autocomplete option "${fullName}"`);
    }

    return this.search();
  }
}

export default EmployeeListPage;
