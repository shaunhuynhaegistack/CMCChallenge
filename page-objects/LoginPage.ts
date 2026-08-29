import type { Locator, Page } from '@playwright/test';
import BasePage from '../lib/BasePage';
import { selectors } from '../lib/BasePage';

export class LoginPage extends BasePage {
  readonly path: string;

  readonly username: Locator;

  readonly password: Locator;

  readonly submitButton: Locator;

  readonly alert: Locator;

  readonly fieldErrors: Locator;

  readonly brandingLogo: Locator;

  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    super(page);

    this.path = '/web/index.php/auth/login';
    this.username = page.locator('input[name="username"]');
    this.password = page.locator('input[name="password"]');
    // Addressed by the name on the button, not by its type: a second form on the
    // page would make `button[type=submit]` ambiguous, the label would not.
    this.submitButton = page.getByRole('button', { name: 'Login' });
    this.alert = page.locator(selectors.alertText);
    this.fieldErrors = page.locator(selectors.fieldError);
    this.brandingLogo = page.locator(selectors.loginBranding);
    this.forgotPasswordLink = page.locator(selectors.forgotPasswordLink);
  }

  async open(baseUrl: string) {
    await this.navigateTo(`${baseUrl}${this.path}`);
    await this.username.waitFor({ state: 'visible' });
  }

  async login(user: string, secret: string) {
    await this.type(this.username, user, 'username');
    await this.type(this.password, secret, 'password');
    await this.click(this.submitButton, 'Login button');
  }

  async openPasswordReset() {
    await this.click(this.forgotPasswordLink, 'Forgot your password? link');
    await this.page.waitForURL('**/auth/requestPasswordResetCode');
  }

  async alertMessage() {
    return this.textOf(this.alert);
  }

  async fieldErrorMessages() {
    await this.fieldErrors.first().waitFor({ state: 'visible' });
    return (await this.fieldErrors.allInnerTexts()).map((text) => text.trim());
  }
}

export default LoginPage;
