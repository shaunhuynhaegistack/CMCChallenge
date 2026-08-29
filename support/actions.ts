import { expect } from '@playwright/test';
import { resolveUser, load } from '../lib/utils/data-helper';
import { buildEmployee, buildUsername } from '../lib/utils/employee-factory';
import environment from '../lib/config/environment';
import { logInfo } from '../lib/logger';
import type { OrangeHrmWorld, IsolatedSession } from './world';
import type { Employee, UserCredentials } from '../lib/types';

interface Role {
  userRoleId: number;
  [key: string]: unknown;
}

export interface ProvisionedAccount {
  username: string;
  password: string;
  userRoleId: number;
  empNumber: number;
  id?: number;
}

/**
 * Domain actions shared by the step definitions.
 *
 * Several scenarios need the same thing done - sign in, create an employee,
 * provision an account - as a *precondition* rather than as the thing under
 * test. Writing that inline in each step is how three slightly different
 * versions of "create an employee" end up in a suite. These are the one version,
 * and every one of them registers what it created so the After hook can clean up.
 */

/**
 * Signs in through the UI and waits for the dashboard.
 *
 * `announce` is off by default: as a precondition the step line already says who
 * is signing in and the field lines say what was typed, so a third line saying
 * the same thing is noise. The authentication feature turns it on, because there
 * the user's description ("valid name, wrong password") is the point.
 *
 * `userKey` is a key in test-data/users.json; `session` lets a caller drive an
 * alternative session (its own page registry and page) instead of the world's.
 */
export const signIn = async (
  world: OrangeHrmWorld,
  userKey: string,
  {
    session = world,
    announce = false
  }: { session?: OrangeHrmWorld | IsolatedSession; announce?: boolean } = {}
): Promise<UserCredentials> => {
  const user = resolveUser(userKey);
  world.state.user = user;

  if (announce) logInfo(`Signing in as ${userKey} - ${user.description}`);
  await session.pages.login.open(world.baseUrl);
  await session.pages.login.login(user.username, user.password);
  await session.pages.dashboard.waitUntilLoaded();

  return user;
};

/**
 * Creates an employee over the API and registers it for teardown.
 * Used wherever an employee is a precondition rather than the subject - driving
 * the Add Employee form for setup would make those scenarios slower and would
 * couple them to a screen they are not testing.
 */
export const createEmployeeViaApi = async (
  world: OrangeHrmWorld,
  overrides: Partial<Employee> = {}
): Promise<Employee> => {
  const employee = buildEmployee(overrides);
  const { response, body } = await world.api.createEmployee(employee);

  expect(response.status(), `Creating ${employee.employeeId} returned ${response.status()}`).toBe(
    200
  );

  employee.empNumber = body.data.empNumber;
  world.created.employees.push(employee.empNumber as number);
  logInfo(`Created employee #${employee.empNumber} (${employee.employeeId}) through the API`);

  return employee;
};

/**
 * Creates an employee and a user account for them in the given role, and
 * registers both for teardown.
 */
export const provisionAccount = async (
  world: OrangeHrmWorld,
  roleName: string
): Promise<{ employee: Employee; account: ProvisionedAccount; role: Record<string, unknown> }> => {
  const role = load<Record<string, Role>>('roles.json')[roleName];
  expect(role, `Unknown role "${roleName}" in test-data/roles.json`).toBeTruthy();

  const employee = await createEmployeeViaApi(world);
  const account: ProvisionedAccount = {
    username: buildUsername(employee),
    password: environment.credentials.essPassword,
    userRoleId: role.userRoleId,
    empNumber: employee.empNumber as number
  };

  const { response, body } = await world.api.createUser(account);
  expect(response.status()).toBe(200);

  account.id = body.data.id;
  world.created.users.push(account.id as number);

  logInfo(
    `Provisioned ${roleName} account "${account.username}" for employee #${employee.empNumber}`
  );
  return { employee, account, role: { name: roleName, ...role } };
};

/**
 * Signs a user in inside a fresh browser context, so the scenario keeps its
 * original session alive alongside the new one.
 */
export const signInAsInSeparateSession = async (
  world: OrangeHrmWorld,
  { username, password }: Pick<UserCredentials, 'username' | 'password'>
): Promise<IsolatedSession> => {
  const session = await world.newIsolatedSession();

  await session.pages.login.open(world.baseUrl);
  await session.pages.login.login(username, password);
  await session.pages.dashboard.waitUntilLoaded();

  return session;
};
