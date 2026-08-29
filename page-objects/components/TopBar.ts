import type { Locator, Page } from '@playwright/test';
import BasePage from '../../lib/BasePage';
import { selectors } from '../../lib/BasePage';

export class TopBar extends BasePage {
  readonly moduleTitle: Locator;

  readonly breadcrumbLevel: Locator;

  readonly userName: Locator;

  readonly userDropdown: Locator;

  constructor(page: Page) {
    super(page);
    // The breadcrumb renders two headings once a sub-screen is open - the module
    // and the level inside it - so the module part is addressed by its own class.
    this.moduleTitle = page.locator(selectors.breadcrumbModule);
    this.breadcrumbLevel = page.locator(selectors.breadcrumbLevel);
    this.userName = page.locator(selectors.userDropdownName);
    this.userDropdown = page.locator(selectors.userDropdownTab);
  }

  async currentModule() {
    return this.textOf(this.moduleTitle);
  }

  async loggedInUser() {
    return this.textOf(this.userName);
  }

  /**
   * Signs out through the menu item's own route rather than its label. The word
   * on it is translated along with the rest of the product, and the display
   * language on a shared instance is somebody else's setting.
   */
  async logout() {
    await this.click(this.userDropdown, 'user dropdown');
    await this.click(this.page.locator(selectors.logoutLink), 'Logout');
    await this.page.waitForURL('**/auth/login', { waitUntil: 'domcontentloaded' });
  }
}

export default TopBar;
