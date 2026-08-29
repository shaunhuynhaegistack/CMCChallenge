import type { Locator, Page } from '@playwright/test';
import BasePage from '../lib/BasePage';
import selectors from '../lib/selectors';
import SideMenu from './components/SideMenu';
import TopBar from './components/TopBar';

export class DashboardPage extends BasePage {
  readonly path: string;

  readonly sideMenu: SideMenu;

  readonly topBar: TopBar;

  readonly widgets: Locator;

  readonly widgetNames: Locator;

  constructor(page: Page) {
    super(page);

    this.path = '/web/index.php/dashboard/index';
    this.sideMenu = new SideMenu(page);
    this.topBar = new TopBar(page);
    this.widgets = page.locator(selectors.dashboardWidget);
    this.widgetNames = page.locator(selectors.dashboardWidgetName);
  }

  async waitUntilLoaded() {
    await this.page.waitForURL('**/dashboard/index');
    await this.topBar.moduleTitle.waitFor({ state: 'visible' });
    await this.waitForSpinnerToDisappear();
  }

  async isLoaded() {
    return this.page.url().includes('/dashboard/index');
  }

  /**
   * The widgets load asynchronously and independently, so the first one on
   * screen is the signal that the dashboard has data rather than a skeleton.
   */
  async widgetTitles() {
    await this.widgetNames.first().waitFor({ state: 'visible' });
    return (await this.widgetNames.allInnerTexts()).map((text) => text.trim());
  }
}

export default DashboardPage;
