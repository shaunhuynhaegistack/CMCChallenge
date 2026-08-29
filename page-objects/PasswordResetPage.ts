import type { Locator, Page } from '@playwright/test';
import { selectors } from '../lib/BasePage';
import AuthFormPage from './AuthFormPage';

/**
 * The one screen an unauthenticated user can reach besides the login form.
 *
 * The username field, the field errors and the submit label all come from
 * AuthFormPage - this screen only adds what is its own: a heading, a cancel
 * button, and a confirmation that arrives as a whole page rather than a toast,
 * because OrangeHRM answers a submitted request on a second route.
 */
export class PasswordResetPage extends AuthFormPage {
  readonly path: string;

  readonly confirmationPath: string;

  readonly submitButton: Locator;

  readonly cancelButton: Locator;

  readonly heading: Locator;

  readonly confirmation: Locator;

  constructor(page: Page) {
    super(page);

    this.path = '/web/index.php/auth/requestPasswordResetCode';
    this.confirmationPath = '/web/index.php/auth/sendPasswordReset';
    this.submitButton = page.locator(selectors.submitButton);
    this.cancelButton = page.locator(selectors.secondaryButton);
    this.heading = page.locator(selectors.resetHeading).first();
    this.confirmation = page.locator(selectors.resetConfirmation).first();
  }

  async headingText(): Promise<string> {
    return this.textOf(this.heading);
  }

  /**
   * The field's own label element. The input group also contains the
   * placeholder, which this product writes in lower case, so reading the group
   * would compare against the wrong string.
   */
  async usernameFieldLabel(): Promise<string> {
    return this.textOf(
      this.page.locator(selectors.inputGroup).filter({ has: this.username }).locator('label')
    );
  }

  /**
   * Submits and resolves on the confirmation route. The wording it returns is
   * what the security scenario compares between a known and an unknown
   * username - if those two differ, the screen tells an attacker which
   * usernames exist.
   */
  async requestReset(username: string): Promise<string> {
    await this.type(this.username, username, 'Username');
    await Promise.all([
      this.page.waitForURL('**/sendPasswordReset', { waitUntil: 'domcontentloaded' }),
      this.click(this.submitButton, 'Reset Password')
    ]);
    return this.textOf(this.confirmation);
  }

  async submitWithoutUsername(): Promise<void> {
    await this.click(this.submitButton, 'Reset Password');
  }

  async cancel(): Promise<void> {
    await this.click(this.cancelButton, 'Cancel');
    await this.page.waitForURL('**/auth/login', { waitUntil: 'domcontentloaded' });
  }
}

export default PasswordResetPage;
