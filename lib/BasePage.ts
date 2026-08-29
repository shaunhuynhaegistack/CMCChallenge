import type { Locator, Page, Response } from '@playwright/test';
import { logAction } from './logger';
import selectors from './selectors';

export type SelectorLike = string | Locator;

/**
 * Shared behaviour for every page object.
 *
 * All interactions go through Playwright locators rather than raw `page.click`
 * so we inherit auto-waiting (actionability checks) instead of hand-rolling
 * sleeps. Anything that needs an explicit wait uses a state-based wait on the
 * element or on a network response - never a fixed timeout.
 */
export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  locator(selector: SelectorLike): Locator {
    return typeof selector === 'string' ? this.page.locator(selector) : selector;
  }

  /**
   * OrangeHRM wraps every field in an `.oxd-input-group` next to its label, and
   * almost none of the inputs carry a `name`. Looking a field up by the label a
   * user reads is both the most stable hook available and the one that keeps the
   * page object readable.
   */
  fieldByLabel(label: string): Locator {
    return this.page
      .locator(selectors.inputGroup)
      .filter({ hasText: label })
      .locator('input')
      .first();
  }

  /**
   * `url` is always absolute - the world builds it from the resolved base URL so
   * page objects stay unaware of which environment they run against.
   */
  async navigateTo(url: string): Promise<void> {
    logAction(`Navigate to ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.waitForSpinnerToDisappear();
  }

  /**
   * Same as `navigateTo`, but hands the navigation response back. Used where the HTTP
   * status is the assertion - OrangeHRM answers 403 with an empty body when a
   * role reaches a page it is not entitled to, so there is nothing on screen to
   * assert against.
   */
  async openAndReturnResponse(url: string): Promise<Response | null> {
    logAction(`Navigate to ${url}`);
    return this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async click(selector: SelectorLike, description?: string): Promise<void> {
    const target = this.locator(selector);
    await target.waitFor({ state: 'visible' });
    await target.click();
    logAction(`Clicked ${description || selector}`);
  }

  async type(selector: SelectorLike, value: string | number, description?: string): Promise<void> {
    const target = this.locator(selector);
    await target.waitFor({ state: 'visible' });
    await target.fill('');
    await target.fill(String(value));

    // CI logs are public on a public repository, so a field that holds a secret
    // never has its value written out - only the fact that it was filled.
    const secret = /password|secret|token|api[-_ ]?key/i.test(description || String(selector));
    logAction(`Filled ${description || selector} with "${secret ? '********' : value}"`);
  }

  async textOf(selector: SelectorLike): Promise<string> {
    const target = this.locator(selector);
    await target.waitFor({ state: 'visible' });
    return (await target.innerText()).trim();
  }

  async valueOf(selector: SelectorLike): Promise<string> {
    const target = this.locator(selector);
    await target.waitFor({ state: 'visible' });
    return (await target.inputValue()).trim();
  }

  async isVisible(selector: SelectorLike, timeout = 5000): Promise<boolean> {
    try {
      await this.locator(selector).waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  async count(selector: SelectorLike): Promise<number> {
    return this.locator(selector).count();
  }

  /**
   * Clicks something that triggers a data fetch and resolves once the matching
   * response has arrived. Filtered lists in OrangeHRM keep the previous rows on
   * screen until the request comes back, so counting rows straight after the
   * click reads stale data.
   */
  async clickAndWaitForApi(
    selector: SelectorLike,
    urlFragment: string,
    description?: string,
    { method = 'GET' }: { method?: string } = {}
  ): Promise<Response> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) => res.url().includes(urlFragment) && res.request().method() === method
      ),
      this.click(selector, description)
    ]);

    await this.waitForSpinnerToDisappear();
    return response;
  }

  /**
   * OrangeHRM renders a toast on every successful save. It disappears after a
   * few seconds, so we wait for it explicitly instead of racing the next step.
   */
  async waitForToast(expected?: string): Promise<string> {
    const toast = this.page.locator(selectors.toast);
    await toast.first().waitFor({ state: 'visible' });
    const text = (await toast.first().innerText()).trim();
    if (expected && !text.toLowerCase().includes(expected.toLowerCase())) {
      throw new Error(`Expected toast to contain "${expected}" but got "${text}"`);
    }
    return text;
  }

  /**
   * The toast is the weakest thing to wait on: it is rendered after the request
   * completes and removes itself a few seconds later, so a slow moment on the
   * server is enough to miss it entirely. Where the outcome is what matters, wait
   * for the request and treat the toast as a nice-to-have.
   */
  async readToastIfPresent(timeout = 5000): Promise<string> {
    const toast = this.page.locator(selectors.toast);
    try {
      await toast.first().waitFor({ state: 'visible', timeout });
      return (await toast.first().innerText()).trim();
    } catch {
      return '';
    }
  }

  /**
   * The app hides content behind a full-screen spinner while XHRs are running.
   * Waiting for it to detach is far more reliable than waiting on networkidle,
   * which never settles because of the polling widgets on the dashboard.
   */
  async waitForSpinnerToDisappear(): Promise<void> {
    const spinner = this.page.locator(selectors.spinner);
    if (await spinner.count()) {
      await spinner
        .first()
        .waitFor({ state: 'detached' })
        .catch(() => {});
    }
  }
}

export default BasePage;
