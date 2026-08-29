import type { Locator, Page } from '@playwright/test';
import BasePage from '../lib/BasePage';
import { selectors } from '../lib/BasePage';

/**
 * What the two unauthenticated screens have in common.
 *
 * The login form and the password reset form are the only screens a signed-out
 * user can reach, and they are built from the same parts: a username input, the
 * same field-error markup, and a submit button addressed by the label a user
 * reads. Keeping those here means a change to how this product renders a form
 * error is one edit rather than one per screen.
 *
 * Subclasses declare only what is theirs - the password field and the branding
 * on one, the heading and the confirmation panel on the other.
 */
export abstract class AuthFormPage extends BasePage {
  readonly username: Locator;

  readonly fieldErrors: Locator;

  /** The screen's own route, so `open` is inherited rather than repeated. */
  abstract readonly path: string;

  /** The submit control, named differently on each screen. */
  abstract readonly submitButton: Locator;

  constructor(page: Page) {
    super(page);

    this.username = page.locator(selectors.usernameField);
    this.fieldErrors = page.locator(selectors.fieldError);
  }

  async open(baseUrl: string): Promise<void> {
    await this.navigateTo(`${baseUrl}${this.path}`);
    await this.username.waitFor({ state: 'visible' });
  }

  /**
   * The submit button's own label.
   *
   * Every page object addresses controls by the label a user reads, which only
   * holds while the instance renders in the language the suite expects. One
   * place has to be able to read that label instead of assuming it, so the
   * localization scenarios can prove the assumption.
   */
  async submitButtonLabel(): Promise<string> {
    await this.submitButton.waitFor({ state: 'visible' });
    return (await this.submitButton.innerText()).trim();
  }

  async fieldErrorMessages(): Promise<string[]> {
    await this.fieldErrors.first().waitFor({ state: 'visible' });
    return (await this.fieldErrors.allInnerTexts()).map((text) => text.trim());
  }

  /** Every button on the screen, for asserting what a form offers. */
  async buttonLabels(): Promise<string[]> {
    return (await this.page.getByRole('button').allInnerTexts()).map((text) => text.trim());
  }
}

export default AuthFormPage;
