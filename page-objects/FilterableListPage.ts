import type { Locator, Page } from '@playwright/test';
import BasePage from '../lib/BasePage';
import { selectors } from '../lib/BasePage';

export interface ListPageOptions {
  /** the screen's route */
  path: string;
  /** the fragment of the fetch that a search triggers */
  listApiPath: string;
}

/**
 * Every list screen in OrangeHRM is the same shape: a filter panel with Search
 * and Reset, a table of cards, a "(n) Records Found" label, and a confirmation
 * dialog for deletions. The employee list and the admin user list differ only in
 * which filters they expose, so the behaviour lives here and each screen adds
 * its own fields.
 *
 * Anything that changes the result set resolves on the response that produced
 * it, never on the rows or a toast - the previous rows stay on screen while the
 * new request is in flight.
 */
export class FilterableListPage extends BasePage {
  readonly path: string;

  readonly listApiPath: string;

  readonly searchButton: Locator;

  readonly resetButton: Locator;

  readonly rows: Locator;

  readonly recordCountLabel: Locator;

  readonly confirmDialog: Locator;

  readonly selectAllCheckbox: Locator;

  constructor(page: Page, { path, listApiPath }: ListPageOptions) {
    super(page);

    this.path = path;
    this.listApiPath = listApiPath;

    this.searchButton = page.getByRole('button', { name: 'Search' });
    this.resetButton = page.getByRole('button', { name: 'Reset' });
    this.rows = page.locator(selectors.tableRow);
    this.recordCountLabel = page.locator(selectors.recordCount).first();
    this.confirmDialog = page.locator(selectors.dialog);
    this.selectAllCheckbox = page.locator(`${selectors.tableHeader} ${selectors.checkbox}`);
  }

  async open(baseUrl: string) {
    await this.navigateTo(`${baseUrl}${this.path}`);
    await this.searchButton.waitFor({ state: 'visible' });
  }

  search(description: string = 'Search') {
    return this.clickAndWaitForApi(this.searchButton, this.listApiPath, description);
  }

  resetFilters() {
    return this.clickAndWaitForApi(this.resetButton, this.listApiPath, 'Reset');
  }

  async rowCount() {
    return this.rows.count();
  }

  async rowTexts() {
    return (await this.rows.allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim());
  }

  /**
   * The header reads "(100) Records Found"; the number is the only part worth
   * asserting on.
   */
  async recordCount() {
    await this.recordCountLabel.waitFor({ state: 'visible' });
    const match = (await this.recordCountLabel.innerText()).match(/\((\d+)\)/);
    return match ? Number(match[1]) : null;
  }

  /**
   * Confirms a deletion and resolves on the DELETE response. The toast is
   * cosmetic and short lived, so it is read only if it happens to still be there.
   */
  async confirmDeletion() {
    await this.confirmDialog.waitFor({ state: 'visible' });

    const response = await this.clickAndWaitForApi(
      this.confirmDialog.locator('button', { hasText: 'Yes, Delete' }),
      this.listApiPath,
      'Yes, Delete',
      { method: 'DELETE' }
    );

    return { status: response.status(), toast: await this.readToastIfPresent() };
  }

  async deleteFirstRow() {
    await this.click(
      this.rows.first().locator(selectors.rowActionButton).last(),
      'row delete icon'
    );
    return this.confirmDeletion();
  }

  async deleteSelectedRows(count: number) {
    for (let index = 0; index < count; index += 1) {
      await this.click(
        this.rows.nth(index).locator(selectors.checkbox),
        `row ${index + 1} checkbox`
      );
    }

    await this.click(this.page.getByRole('button', { name: 'Delete Selected' }), 'Delete Selected');
    return this.confirmDeletion();
  }
}

export default FilterableListPage;
