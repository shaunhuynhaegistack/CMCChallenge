import type { Locator, Page } from '@playwright/test';
import FilterableListPage from './FilterableListPage';
import { selectors } from '../lib/BasePage';

export class LeaveListPage extends FilterableListPage {
  readonly leaveTypeSelect: Locator;

  readonly selectOptions: Locator;

  constructor(page: Page) {
    super(page, {
      path: '/web/index.php/leave/viewLeaveList',
      listApiPath: '/api/v2/leave/employees/leave-requests'
    });

    this.leaveTypeSelect = page
      .locator(selectors.inputGroup)
      .filter({ hasText: 'Leave Type' })
      .locator(selectors.selectText);
    this.selectOptions = page.locator(selectors.selectOption);
  }

  /**
   * The dropdown is a custom widget rather than a `<select>`, so the options only
   * exist in the DOM while it is open.
   */
  async leaveTypeOptions() {
    await this.click(this.leaveTypeSelect, 'Leave Type dropdown');

    // The widget renders the placeholder immediately and fills the rest in when
    // its request lands, so waiting for the first option would read a list of
    // one. Waiting for a second one is the signal that the data arrived.
    await this.page
      .locator(`${selectors.selectOption} >> nth=1`)
      .waitFor({ state: 'visible', timeout: 15000 });

    const options = (await this.selectOptions.allInnerTexts()).map((text) => text.trim());
    await this.page.keyboard.press('Escape');

    // The placeholder row is part of the widget, not a leave type.
    return options.filter((option) => option !== '-- Select --');
  }
}

export default LeaveListPage;
