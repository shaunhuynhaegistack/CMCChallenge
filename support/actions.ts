import { expect } from '@playwright/test';
import { resolveUser, load } from '../lib/utils/data-helper';
import { buildEmployee, buildUsername } from '../test-data/employee-factory';
import environment from '../lib/config/environment';
import endpoints from '../lib/api/endpoints';
import {
  EXPECTED_LANGUAGE,
  EXPECTED_DATE_FORMAT,
  signIn as apiSignIn,
  normaliseLocalization
} from '../lib/api/instance';
import { logInfo, logWarn } from '../lib/logger';
import type { OrangeHrmWorld, IsolatedSession } from './world';
import type AuthFormPage from '../page-objects/AuthFormPage';
import type { Employee, UserCredentials } from '../lib/BasePage';

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
  await ensureLocalization(world, session);

  return user;
};

/**
 * Repairs the instance localization if it has drifted since the run started.
 *
 * The runner normalises it once before the suite begins, which is enough on a
 * target nobody else touches. This one is public: the display language was
 * observed changing *while* a run was in progress, and every assertion on a
 * label the user reads fails the moment it does - the module breadcrumb comes
 * back as "Pizarra de pendientes" and the scenario reports a defect that is not
 * there.
 *
 * Checked here because this is the first point in a scenario where a session
 * exists, and it costs one GET. The PUT only happens when something is wrong.
 *
 * The setting is read and written through `world.api` because that is the admin
 * session; `session` is whose screen has to be redrawn afterwards, which is not
 * the same thing when the caller is the role scenarios' second, ESS session. A
 * repair that stopped at the API would leave the page that is about to be
 * asserted still rendered in the language the suite has just corrected.
 */
const ensureLocalization = async (
  world: OrangeHrmWorld,
  session: OrangeHrmWorld | IsolatedSession
): Promise<void> => {
  const { dateFormat, language } = await world.api.getLocalization();
  if (language === EXPECTED_LANGUAGE && dateFormat === EXPECTED_DATE_FORMAT) return;

  logWarn(
    `The instance drifted to language "${language}", date format "${dateFormat}" mid-run. ` +
      'Putting it back.'
  );
  await world.api.send('PUT', endpoints.admin.localization, {
    data: { language: EXPECTED_LANGUAGE, dateFormat: EXPECTED_DATE_FORMAT }
  });
  await session.page.reload({ waitUntil: 'domcontentloaded' });
};

/**
 * The same repair, for the scenarios that never sign in.
 *
 * The login and password reset screens assert the words the product renders -
 * "Required", the rejection message, the button labels - and those are English
 * only while the instance says so. `ensureLocalization` cannot help there: it
 * asserts through the session the scenario has not created yet, and these
 * screens are the ones reached without one.
 *
 * So the check is the label already on screen, which costs nothing when
 * everything is fine. Only when it has drifted does this pay for an admin
 * sign-in over plain fetch - the same path the runner uses before the suite -
 * and reload the screen with the setting put back.
 */
export const ensureAuthScreenLanguage = async (
  world: OrangeHrmWorld,
  screen: AuthFormPage
): Promise<void> => {
  const label = await screen.submitButtonLabel();
  if (label === screen.expectedSubmitLabel) return;

  logWarn(
    `The ${screen.constructor.name} submit button reads "${label}" rather than ` +
      `"${screen.expectedSubmitLabel}", so the instance language has drifted. Putting it back.`
  );

  const cookie = await apiSignIn(world.baseUrl);
  await normaliseLocalization(world.baseUrl, cookie);
  await screen.open(world.baseUrl);
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
  // The same repair `signIn` performs. The setting is instance-wide, so a drift
  // between the first sign-in and this one reaches the new context too, and the
  // role assertions read the side menu labels the user sees. Checked through the
  // admin session, redrawn in this one - an ESS account cannot write the setting.
  await ensureLocalization(world, session);

  return session;
};
