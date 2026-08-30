import type { Locator, Page } from '@playwright/test';
import { selectors } from '../lib/BasePage';
import AuthFormPage from './AuthFormPage';

/**
 * The one screen an unauthenticated user can reach besides the login form.
 *
 * The username field, the field errors and the submit label all come from
 * AuthFormPage - this screen only adds what is its own: a heading and a cancel
 * button.
 *
 * Nothing here submits a reset. The instance throttles the request and then
 * stops answering, so a scenario built on one being accepted is unstable for a
 * reason unrelated to this code; the property that submission would have proved
 * is asserted on the login form instead.
 */
export class PasswordResetPage extends AuthFormPage {
  readonly path: string;

  readonly submitButton: Locator;

  readonly expectedSubmitLabel = 'Reset Password';

  readonly cancelButton: Locator;

  readonly heading: Locator;

  constructor(page: Page) {
    super(page);

    this.path = '/web/index.php/auth/requestPasswordResetCode';
    this.submitButton = page.locator(selectors.submitButton);
    this.cancelButton = page.locator(selectors.secondaryButton);
    this.heading = page.locator(selectors.resetHeading).first();
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

  async submitWithoutUsername(): Promise<void> {
    await this.click(this.submitButton, 'Reset Password');
  }

  async cancel(): Promise<void> {
    await this.click(this.cancelButton, 'Cancel');
    await this.page.waitForURL('**/auth/login', { waitUntil: 'domcontentloaded' });
  }
}

export default PasswordResetPage;
