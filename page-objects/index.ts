import type { Page } from '@playwright/test';
import LoginPage from './LoginPage';
import DashboardPage from './DashboardPage';
import AddEmployeePage from './AddEmployeePage';
import PersonalDetailsPage from './PersonalDetailsPage';
import EmployeeListPage from './EmployeeListPage';
import AdminUserListPage from './AdminUserListPage';
import ContactDetailsPage from './ContactDetailsPage';
import CandidateListPage from './CandidateListPage';
import LeaveListPage from './LeaveListPage';
import PasswordResetPage from './PasswordResetPage';
import ModuleNavigation from './ModuleNavigation';

/**
 * Page objects are created lazily per Playwright page. Steps therefore never
 * construct them by hand, and a scenario that opens a second session gets its
 * own independent set.
 */
export const createPages = (page: Page) => {
  const registry = new Map<string, unknown>();
  const memoize = <T>(key: string, factory: () => T): T => {
    if (!registry.has(key)) registry.set(key, factory());
    return registry.get(key) as T;
  };

  return {
    get login() {
      return memoize('login', () => new LoginPage(page));
    },
    get dashboard() {
      return memoize('dashboard', () => new DashboardPage(page));
    },
    get addEmployee() {
      return memoize('addEmployee', () => new AddEmployeePage(page));
    },
    get personalDetails() {
      return memoize('personalDetails', () => new PersonalDetailsPage(page));
    },
    get employeeList() {
      return memoize('employeeList', () => new EmployeeListPage(page));
    },
    get adminUsers() {
      return memoize('adminUsers', () => new AdminUserListPage(page));
    },
    get contactDetails() {
      return memoize('contactDetails', () => new ContactDetailsPage(page));
    },
    get candidates() {
      return memoize('candidates', () => new CandidateListPage(page));
    },
    get leaveList() {
      return memoize('leaveList', () => new LeaveListPage(page));
    },
    get passwordReset() {
      return memoize('passwordReset', () => new PasswordResetPage(page));
    },
    get modules() {
      return memoize('modules', () => new ModuleNavigation(page));
    }
  };
};

export type Pages = ReturnType<typeof createPages>;
