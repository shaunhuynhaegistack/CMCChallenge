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
    return this.search('Search', 'employeeId=');
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

    // Picking a suggestion filters by empNumber; leaving the text alone filters
    // by name. The wait is narrowed to whichever request this actually causes.
    // Free text searches by nameOrId, which is also what the autocomplete asks
    // for - `model=detailed` is what tells the two apart.
    return this.search('Search', pickSuggestion ? 'empNumber=' : ['model=detailed', 'nameOrId=']);
  }
}

export default EmployeeListPage;
