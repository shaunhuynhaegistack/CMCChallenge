/**
 * The shapes shared across the framework. Keeping them in one module means a
 * page object, a step definition and the API client all agree on what an
 * employee is, and a rename shows up as a compile error rather than as a
 * failing scenario.
 */

export interface Employee {
  firstName: string;
  middleName?: string;
  lastName: string;
  employeeId: string;
  empNumber?: number;
}

export interface UserCredentials {
  username: string;
  password: string;
  role?: string;
  description?: string;
}

export interface Timeouts {
  step: number;
  expect: number;
  action: number;
  navigation: number;
}

export interface ExecutionSettings {
  browser: string;
  workers: number;
  retries: number;
  headless: boolean;
  slowMo: number;
}

export interface StabilitySettings {
  retryTagFilter: string;
  trace: string;
  apiRetryAttempts: number;
  video: string;
}

export interface Credentials {
  adminUsername?: string;
  adminPassword?: string;
  essPassword: string;
}

export interface Environment {
  name: string;
  baseUrl: string;
  apiBasePath: string;
  timeouts: Timeouts;
  execution: ExecutionSettings;
  stability: StabilitySettings;
  credentials: Credentials;
}
