import type { Locator, Page } from '@playwright/test';
import { selectors } from '../lib/BasePage';
import AuthFormPage from './AuthFormPage';

export class LoginPage extends AuthFormPage {
  readonly path: string;

  readonly password: Locator;

  readonly submitButton: Locator;

  readonly expectedSubmitLabel = 'Login';

  readonly alert: Locator;

  readonly brandingLogo: Locator;

  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    super(page);

    this.path = '/web/index.php/auth/login';
    this.password = page.locator(selectors.passwordField);
    this.submitButton = page.locator(selectors.submitButton);
    this.alert = page.locator(selectors.alertText);
    this.brandingLogo = page.locator(selectors.loginBranding);
    this.forgotPasswordLink = page.locator(selectors.forgotPasswordLink);
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
}

export default LoginPage;
