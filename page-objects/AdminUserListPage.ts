import type { Locator, Page } from '@playwright/test';
import FilterableListPage from './FilterableListPage';

export class AdminUserListPage extends FilterableListPage {
  readonly usernameFilter: Locator;

  constructor(page: Page) {
    super(page, {
      path: '/web/index.php/admin/viewSystemUsers',
      listApiPath: '/api/v2/admin/users'
    });

    this.usernameFilter = this.fieldByLabel('Username');
  }

  async searchByUsername(username: string) {
    await this.type(this.usernameFilter, username, 'Username filter');
    return this.search('Search', 'username=');
  }
}

export default AdminUserListPage;
