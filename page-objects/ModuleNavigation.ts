import type { Page, Response } from '@playwright/test';
import BasePage from '../lib/BasePage';
import { selectors } from '../lib/BasePage';

/**
 * The modules this instance ships, and where each one lands.
 *
 * The route is the entry point in the side menu; the landing route is where the
 * application actually leaves the browser, which is not the same thing - most
 * modules redirect to their first screen. Both are read from the running
 * application rather than assumed, and kept here so a module that moves is one
 * edit.
 */
export const MODULE_ROUTES: Record<string, string> = {
  Admin: '/web/index.php/admin/viewAdminModule',
  PIM: '/web/index.php/pim/viewPimModule',
  Leave: '/web/index.php/leave/viewLeaveModule',
  Time: '/web/index.php/time/viewTimeModule',
  Recruitment: '/web/index.php/recruitment/viewRecruitmentModule',
  'My Info': '/web/index.php/pim/viewMyDetails',
  Performance: '/web/index.php/performance/viewPerformanceModule',
  Dashboard: '/web/index.php/dashboard/index',
  Directory: '/web/index.php/directory/viewDirectory',
  Maintenance: '/web/index.php/maintenance/viewMaintenanceModule',
  Claim: '/web/index.php/claim/viewClaimModule',
  Buzz: '/web/index.php/buzz/viewBuzz'
};

/**
 * Navigation across modules, kept apart from any one screen's page object.
 * Nothing here writes: these are the checks that can be made on a shared
 * instance without touching records somebody else is using.
 */
export class ModuleNavigation extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Clicks the entry in the side menu and waits for the application to settle
   * wherever it decides to land, rather than asserting the click's own href.
   */
  async openFromMenu(module: string): Promise<void> {
    await this.click(
      this.page.locator(selectors.menuItem, { hasText: module }).first(),
      `${module} in the side menu`
    );
    await this.page.waitForLoadState('domcontentloaded');
    await this.waitForSpinnerToDisappear();
  }

  /** The heading the module renders for itself, whatever it is called. */
  async moduleHeading(): Promise<string> {
    const heading = this.page.locator(selectors.breadcrumbModule).first();
    await heading.waitFor({ state: 'visible' });
    return (await heading.innerText()).trim();
  }

  /**
   * Requests a route without going through the menu, so a module that the menu
   * happens not to show is still checked.
   */
  async request(module: string): Promise<Response | null> {
    return this.openAndReturnResponse(
      `${this.page.url().split('/web/')[0]}${MODULE_ROUTES[module]}`
    );
  }
}

export default ModuleNavigation;
