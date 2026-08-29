import environment from '../config/environment';

const API_ROOT = environment.apiBasePath;

/**
 * Every OrangeHRM web API path used by the suite, in one place.
 * The application is a SPA on top of a session-cookie protected REST API, so the
 * routes the UI calls are the ones we assert against.
 */
const endpoints = {
  auth: {
    loginPage: '/web/index.php/auth/login',
    validate: '/web/index.php/auth/validate',
    logout: '/web/index.php/auth/logout'
  },
  pim: {
    employees: `${API_ROOT}/pim/employees`,
    employee: (empNumber: number | string): string => `${API_ROOT}/pim/employees/${empNumber}`,
    personalDetails: (empNumber: number | string): string =>
      `${API_ROOT}/pim/employees/${empNumber}/personal-details`,
    // Note the singular `employee` - the contact details route does not follow
    // the same shape as the rest of the PIM API.
    contactDetails: (empNumber: number | string): string =>
      `${API_ROOT}/pim/employee/${empNumber}/contact-details`
  },
  recruitment: {
    candidates: `${API_ROOT}/recruitment/candidates`
  },
  leave: {
    types: `${API_ROOT}/leave/leave-types`,
    requests: `${API_ROOT}/leave/employees/leave-requests`
  },
  admin: {
    users: `${API_ROOT}/admin/users`,
    user: (id: number | string): string => `${API_ROOT}/admin/users/${id}`,
    localization: `${API_ROOT}/admin/localization`
  }
} as const;

export default endpoints;
