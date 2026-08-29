import type { Locator, Page } from '@playwright/test';
import BasePage from '../../lib/BasePage';
import selectors from '../../lib/selectors';

/**
 * Left hand navigation. Which items appear here is driven by the role of the
 * logged in user, so this component doubles as the assertion surface for the
 * role based scenarios.
 */
export class SideMenu extends BasePage {
  readonly root: Locator;

  readonly items: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.locator(selectors.sidePanel);
    this.items = page.locator(selectors.menuItemLabel);
  }

  async moduleNames() {
    await this.items.first().waitFor({ state: 'visible' });
    return (await this.items.allInnerTexts()).map((text) => text.trim());
  }

  async hasModule(name: string) {
    const names = await this.moduleNames();
    return names.includes(name);
  }

  async openModule(name: string) {
    await this.click(
      this.page.locator(selectors.menuItem, { hasText: name }).first(),
      `${name} menu`
    );
    await this.waitForSpinnerToDisappear();
  }
}

export default SideMenu;
