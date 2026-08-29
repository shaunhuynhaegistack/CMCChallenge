import type { Locator, Page } from '@playwright/test';
import BasePage from '../lib/BasePage';
import { selectors } from '../lib/BasePage';

export class ContactDetailsPage extends BasePage {
  readonly street1: Locator;

  readonly city: Locator;

  readonly postcode: Locator;

  readonly mobile: Locator;

  readonly workEmail: Locator;

  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);

    this.street1 = this.fieldByLabel('Street 1');
    this.city = this.fieldByLabel('City');
    this.postcode = this.fieldByLabel('Zip/Postal Code');
    this.mobile = this.fieldByLabel('Mobile');
    this.workEmail = this.fieldByLabel('Work Email');
    this.saveButton = page.locator(selectors.submitButton).first();
  }

  pathFor(empNumber: number | string) {
    return `/web/index.php/pim/contactDetails/empNumber/${empNumber}`;
  }

  /**
   * Like the personal details screen, the form renders before its own request
   * comes back and is overwritten when it does. Every field starts empty for a
   * new employee, so there is no value to wait for - the response itself is the
   * only reliable signal.
   */
  async open(baseUrl: string, empNumber: number | string) {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) => res.url().includes('/contact-details') && res.request().method() === 'GET'
      ),
      this.navigateTo(`${baseUrl}${this.pathFor(empNumber)}`)
    ]);

    await this.street1.waitFor({ state: 'visible' });
    return response;
  }

  async fillContactDetails(details: Record<string, string>) {
    await this.type(this.street1, details.street1, 'Street 1');
    await this.type(this.city, details.city, 'City');
    await this.type(this.postcode, details.postcode, 'Zip/Postal Code');
    await this.type(this.mobile, details.mobile, 'Mobile');
    await this.type(this.workEmail, details.workEmail, 'Work Email');
  }

  async save() {
    const response = await this.clickAndWaitForApi(this.saveButton, '/contact-details', 'Save', {
      method: 'PUT'
    });
    return { status: response.status(), toast: await this.readToastIfPresent() };
  }

  async readContactDetails() {
    return {
      street1: await this.valueOf(this.street1),
      city: await this.valueOf(this.city),
      postcode: await this.valueOf(this.postcode),
      mobile: await this.valueOf(this.mobile),
      workEmail: await this.valueOf(this.workEmail)
    };
  }
}

export default ContactDetailsPage;
