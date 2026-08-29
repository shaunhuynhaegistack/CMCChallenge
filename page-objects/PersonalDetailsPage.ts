import type { Locator, Page } from '@playwright/test';
import BasePage from '../lib/BasePage';
import selectors from '../lib/selectors';

/**
 * Employee > Personal Details.
 *
 * The form is rendered before the employee record has been fetched, so the
 * fields are briefly empty and any value typed into them is wiped by the
 * re-render. `waitUntilLoaded` closes that gap - see the flaky test notes in the
 * README, this was a real intermittent failure before the wait was added.
 */
export class PersonalDetailsPage extends BasePage {
  readonly firstName: Locator;

  readonly lastName: Locator;

  readonly saveButtons: Locator;

  constructor(page: Page) {
    super(page);

    this.firstName = page.locator('input[name="firstName"]');
    this.lastName = page.locator('input[name="lastName"]');
    this.saveButtons = page.getByRole('button', { name: 'Save' });
  }

  pathFor(empNumber: number | string) {
    return `/web/index.php/pim/viewPersonalDetails/empNumber/${empNumber}`;
  }

  async open(baseUrl: string, empNumber: number | string) {
    await this.navigateTo(`${baseUrl}${this.pathFor(empNumber)}`);
    await this.waitUntilLoaded();
  }

  async waitUntilLoaded() {
    await this.firstName.waitFor({ state: 'visible' });
    await this.page.waitForFunction(
      () => {
        const field = document.querySelector<HTMLInputElement>('input[name="firstName"]');
        return Boolean(field && field.value.trim().length);
      },
      null,
      { timeout: 20000 }
    );
  }

  async updateDetails(details: Record<string, string>) {
    if (details.otherId !== undefined) {
      await this.type(this.fieldByLabel('Other Id'), details.otherId, 'Other Id');
    }
    if (details.drivingLicenseNo !== undefined) {
      await this.type(
        this.fieldByLabel("Driver's License Number"),
        details.drivingLicenseNo,
        "Driver's License Number"
      );
    }
    if (details.birthday !== undefined) {
      await this.type(this.fieldByLabel('Date of Birth'), details.birthday, 'Date of Birth');
    }
    if (details.gender !== undefined) {
      await this.selectGender(details.gender);
    }
  }

  /**
   * The radio input itself is visually hidden, so the click has to land on the
   * label. Filtering with an anchored regex avoids matching "Female" when we
   * asked for "Male".
   */
  async selectGender(gender: string) {
    const option = this.page
      .locator(selectors.radioWrapper)
      .filter({ hasText: new RegExp(`^${gender}$`) })
      .locator('label');
    await this.click(option, `${gender} radio`);
  }

  async savePersonalDetails() {
    await this.click(this.page.getByRole('button', { name: 'Save' }).first(), 'Save');
    return this.waitForToast('Successfully Updated');
  }

  async readDetails() {
    return {
      firstName: await this.valueOf(this.firstName),
      lastName: await this.valueOf(this.lastName),
      otherId: await this.valueOf(this.fieldByLabel('Other Id')),
      drivingLicenseNo: await this.valueOf(this.fieldByLabel("Driver's License Number")),
      birthday: await this.valueOf(this.fieldByLabel('Date of Birth'))
    };
  }
}

export default PersonalDetailsPage;
