import type { Locator, Page, Response } from '@playwright/test';
import { logAction, logWarn } from './logger';

export type SelectorLike = string | Locator;

const selectors = {
  // Shell
  sidePanel: '.oxd-sidepanel',
  menuItem: '.oxd-main-menu-item',
  menuItemLabel: '.oxd-main-menu-item span',
  breadcrumbModule: '.oxd-topbar-header-breadcrumb-module',
  breadcrumbLevel: '.oxd-topbar-header-breadcrumb-level',
  userDropdownTab: '.oxd-userdropdown-tab',
  userDropdownName: '.oxd-userdropdown-name',

  // Forms
  inputGroup: '.oxd-input-group',
  fieldError: '.oxd-input-field-error-message',

  // The username input is the one control both unauthenticated screens share,
  // and the one place in this product where a `name` attribute can be relied on.
  usernameField: 'input[name="username"]',
  passwordField: 'input[name="password"]',

  // Addressed structurally on purpose. Everywhere else this suite finds a
  // control by the label a user reads, but the two unauthenticated screens have
  // to keep working while that label is being changed - the localization
  // scenarios switch the instance language and then read the label back, which
  // is impossible with a locator that already assumes it.
  submitButton: 'button[type="submit"]',
  secondaryButton: 'button[type="button"]',
  // Reset and Cancel are the ghost variant of this product's button component;
  // Search and Save are the form's submit. Both are true in any language.
  ghostButton: 'button.oxd-button--ghost',

  // Sign-out is reached by its route rather than by the word on the menu item.
  // The label is translated with the rest of the product, and this suite has
  // watched the instance language change under a running scenario.
  logoutLink: 'a[href*="/auth/logout"]',

  // The section tabs down the side of a personnel record.
  recordTab: '.orangehrm-tabs-item',
  alertText: '.oxd-alert-content-text',
  radioWrapper: '.oxd-radio-wrapper',
  autocompleteOption: '.oxd-autocomplete-option',
  selectText: '.oxd-select-text',
  selectOption: '.oxd-select-option',
  formActions: '.oxd-form-actions',
  checkbox: '.oxd-checkbox-input',

  // Feedback
  toast: '.oxd-toast',
  spinner: '.oxd-loading-spinner',
  dialog: '.oxd-dialog-sheet',

  // Tables
  tableRow: '.oxd-table-card',
  tableHeader: '.oxd-table-header',
  rowActionButton: '.oxd-icon-button',

  // Addressed by the icon it carries rather than by its position in the row.
  // The employee list renders edit then delete; the admin user list renders
  // delete then edit, so "the last button" is the delete on one screen and the
  // edit on the other - which deletes nothing and quietly opens a form.
  rowDeleteButton: 'button:has(.bi-trash)',
  // The filter panel above a list. Asserting a filter's label inside this
  // container rather than anywhere on the page keeps the check honest: the same
  // words appear in table headers and in the side menu.
  filterPanel: '.oxd-table-filter',
  recordCount: '.orangehrm-horizontal-padding span',

  // Screens
  loginBranding: '.orangehrm-login-branding img',
  forgotPasswordLink: '.orangehrm-login-forgot-header',

  // The password reset screen: its own heading and its own confirmation panel,
  // neither of which is a toast - the confirmation is a whole page.
  resetHeading: '.orangehrm-forgot-password-title',
  dashboardWidget: '.oxd-grid-item.orangehrm-dashboard-widget',
  dashboardWidgetName: '.orangehrm-dashboard-widget-name'
} as const;

export { selectors };

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
    { method = 'GET', query }: { method?: string; query?: string | string[] } = {}
  ): Promise<Response> {
    // `query` narrows the match to the request the click actually caused.
    // Without it the first matching response can be the one the screen was
    // already making when the click landed, and the assertion then reads the
    // rows from before the filter was applied. Several fragments can be given
    // where one is not enough to tell two requests apart - the autocomplete and
    // the search behind it are both a `nameOrId` lookup.
    const fragments = query === undefined ? [] : [query].flat();

    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) =>
          res.url().includes(urlFragment) &&
          res.request().method() === method &&
          fragments.every((fragment) => res.url().includes(fragment))
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

/* ------------------------------------------------------------------ *
 * The shapes every layer agrees on. A rename shows up here as a
 * compile error rather than as a scenario that fails at three in the
 * morning against a shared instance.
 * ------------------------------------------------------------------ */

export interface Employee {
  firstName: string;
  middleName?: string;
  lastName: string;
  employeeId: string;
  empNumber?: number;
}

export interface UserCredentials {
  username: string;
  password: string;
  role?: string;
  description?: string;
}

export interface Timeouts {
  step: number;
  expect: number;
  action: number;
  navigation: number;
}

export interface ExecutionSettings {
  browser: string;
  workers: number;
  retries: number;
  headless: boolean;
  slowMo: number;
}

export interface StabilitySettings {
  retryTagFilter: string;
  trace: string;
  apiRetryAttempts: number;
  video: string;
}

export interface Credentials {
  adminUsername?: string;
  adminPassword?: string;
  essPassword: string;
}

export interface Environment {
  name: string;
  baseUrl: string;
  apiBasePath: string;
  timeouts: Timeouts;
  execution: ExecutionSettings;
  stability: StabilitySettings;
  credentials: Credentials;
}

/* ------------------------------------------------------------------ *
 * The waits Playwright's own auto-waiting cannot express: a value that
 * has to appear in an API response, a record a background job still has
 * to write, and a backoff for a call that failed for reasons unrelated
 * to the assertion.
 * ------------------------------------------------------------------ */

// guardrail-allow: no-fixed-waits - polling backoff, not a wait on the application
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface WaitOptions {
  timeout?: number;
  interval?: number;
  description?: string;
}

/**
 * Polls `predicate` until it returns a truthy value or the timeout expires.
 *
 * Playwright's own auto-waiting covers element state, so this is only for the
 * cases it cannot see - a value that has to appear in an API response, a record
 * that a background job still has to write, and similar.
 */
export const waitUntil = async <T>(
  predicate: () => T | Promise<T>,
  { timeout = 15000, interval = 500, description = 'condition' }: WaitOptions = {}
): Promise<T> => {
  const deadline = Date.now() + timeout;
  let lastError: Error | undefined;

  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error as Error;
    }
    await sleep(interval);
  }

  const reason = lastError ? ` Last error: ${lastError.message}` : '';
  throw new Error(`Timed out after ${timeout}ms waiting for ${description}.${reason}`);
};

interface RetryOptions {
  attempts?: number;
  delay?: number;
  description?: string;
}

/**
 * Retries an operation with a linear backoff. Used for calls that can fail for
 * reasons unrelated to the assertion - the shared demo instance occasionally
 * answers a request with a gateway error under load.
 */
export const retryAsync = async <T>(
  operation: (attempt: number) => Promise<T>,
  { attempts = 3, delay = 1000, description = 'operation' }: RetryOptions = {}
): Promise<T> => {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error as Error;
      logWarn(`Attempt ${attempt}/${attempts} of ${description} failed: ${lastError.message}`);
      if (attempt < attempts) await sleep(delay * attempt);
    }
  }

  throw lastError;
};

/**
 * The application's structural selectors, in one place.
 *
 * OrangeHRM is built on its own component library, whose class names (`oxd-*`)
 * are the only stable hook some widgets expose - there is no test id anywhere in
 * the product. Two rules keep that from becoming a maintenance problem:
 *
 *   1. Anything a user can name - a button, a field, a menu item - is addressed
 *      by that name in the page object (`getByRole`, or a field looked up by its
 *      label). Those survive a restyle, and they read like the interface.
 *   2. Everything else is addressed by the component class, and every one of
 *      those classes is listed here. When the design system moves, this file is
 *      the diff, not fifteen page objects.
 */
