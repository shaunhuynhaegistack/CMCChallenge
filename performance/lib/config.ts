/**
 * Shared configuration for the k6 scripts.
 * Everything is driven by environment variables so the same script runs as a
 * smoke check locally and as a load stage on CI without being edited.
 */
export const BASE_URL = (__ENV.BASE_URL || 'https://opensource-demo.orangehrmlive.com').replace(
  /\/$/,
  ''
);

export const CREDENTIALS = {
  username: __ENV.ADMIN_USERNAME || 'Admin',
  password: __ENV.ADMIN_PASSWORD || 'admin123'
};

export const PATHS = {
  loginPage: '/web/index.php/auth/login',
  validate: '/web/index.php/auth/validate',
  employees: '/web/index.php/api/v2/pim/employees'
};

export const asInt = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
