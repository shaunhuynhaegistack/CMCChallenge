import type { APIRequestContext, APIResponse, BrowserContext } from '@playwright/test';
import endpoints from './endpoints';
import environment from '../config/environment';
import { retryAsync } from '../utils/waits';
import { logInfo } from '../logger';
import type { Employee } from '../types';

export interface ApiResult<T = any> {
  response: APIResponse;
  body: T | null;
}

interface SendOptions {
  headers?: Record<string, string>;
  data?: unknown;
  /**
   * How many times a transient status is retried. Teardown passes 1: a scenario
   * that has already finished should not spend a minute backing off while the
   * instance is having a bad time.
   */
  attempts?: number;
}

export interface Candidate {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  dateOfApplication: string;
}

interface NewUser {
  username: string;
  password: string;
  userRoleId: number;
  empNumber: number;
  status?: boolean;
}

interface ListEmployeesOptions {
  limit?: number;
  offset?: number;
  nameOrId?: string;
  sortField?: string;
}

// The shared demo instance occasionally answers with a server or gateway error
// under load - a POST that returns 500 and then succeeds unchanged on the next
// attempt is infrastructure noise, not a test result. Those are retried; every
// other status, 403 and 422 included, is returned untouched for the assertion to
// judge.
const TRANSIENT_STATUSES = [429, 500, 502, 503, 504];

/**
 * Thin wrapper over Playwright's APIRequestContext.
 *
 * It is built from the *browser context* of the running scenario, which means it
 * inherits the session cookie created by the UI login. That is what makes the
 * API-level verification meaningful: we assert against the same authenticated
 * session the user is driving, not a separately minted one.
 */
export class ApiClient {
  readonly request: APIRequestContext;

  readonly baseUrl: string;

  lastResponse: APIResponse | null = null;

  constructor(requestContext: APIRequestContext, baseUrl: string) {
    this.request = requestContext;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  static fromBrowserContext(context: BrowserContext, baseUrl: string): ApiClient {
    return new ApiClient(context.request, baseUrl);
  }

  url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  async send(method: string, path: string, options: SendOptions = {}): Promise<APIResponse> {
    const response = await retryAsync(
      async () => {
        const attempt = await this.request.fetch(this.url(path), {
          method,
          headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
          data: options.data as any,
          // An explicit ceiling: without it a request that never answers holds
          // the step open until Cucumber's own timeout, which is far longer.
          timeout: environment.timeouts.action,
          failOnStatusCode: false
        });

        if (TRANSIENT_STATUSES.includes(attempt.status())) {
          throw new Error(`Transient ${attempt.status()} from ${method} ${path}`);
        }

        return attempt;
      },
      {
        attempts: options.attempts ?? environment.stability.apiRetryAttempts,
        description: `${method} ${path}`
      }
    );

    this.lastResponse = response;
    logInfo(`API ${method} ${path} -> ${response.status()}`);
    return response;
  }

  async json<T = any>(response: APIResponse): Promise<T | null> {
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  async createEmployee(employee: Employee): Promise<ApiResult> {
    const response = await this.send('POST', endpoints.pim.employees, {
      data: {
        firstName: employee.firstName,
        middleName: employee.middleName || '',
        lastName: employee.lastName,
        employeeId: employee.employeeId
      }
    });
    return { response, body: await this.json(response) };
  }

  async getEmployee(empNumber: number | string): Promise<ApiResult> {
    const response = await this.send('GET', endpoints.pim.employee(empNumber));
    return { response, body: await this.json(response) };
  }

  async getPersonalDetails(empNumber: number | string): Promise<ApiResult> {
    const response = await this.send('GET', endpoints.pim.personalDetails(empNumber));
    return { response, body: await this.json(response) };
  }

  /**
   * The endpoint replaces the whole record, so the caller has to send the fields
   * it wants to keep as well as the ones it is changing.
   */
  async updatePersonalDetails(
    empNumber: number | string,
    details: Record<string, unknown>
  ): Promise<ApiResult> {
    const response = await this.send('PUT', endpoints.pim.personalDetails(empNumber), {
      data: {
        drivingLicenseExpiredDate: null,
        nationalityId: null,
        ...details
      }
    });
    return { response, body: await this.json(response) };
  }

  async getContactDetails(empNumber: number | string): Promise<ApiResult> {
    const response = await this.send('GET', endpoints.pim.contactDetails(empNumber));
    return { response, body: await this.json(response) };
  }

  /**
   * Sorted by employee id, which is unique.
   *
   * That is not a style preference. Offset pagination over a sort key with ties
   * is not stable in this API: two records that compare equal can come back in a
   * different order on each request, so page two repeats a row from page one and
   * drops one entirely. Reproduced with three employees sharing a last name -
   * sorting by that name, page two returned a record page one had already
   * returned; sorting by employee id, it did not.
   */
  async listEmployees({
    limit = 10,
    offset = 0,
    nameOrId,
    sortField = 'employee.employeeId'
  }: ListEmployeesOptions = {}): Promise<ApiResult> {
    const query = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      model: 'detailed',
      includeEmployees: 'onlyCurrent',
      sortField,
      sortOrder: 'ASC',
      ...(nameOrId ? { nameOrId } : {})
    });
    const response = await this.send('GET', `${endpoints.pim.employees}?${query}`);
    return { response, body: await this.json(response) };
  }

  async deleteEmployees(empNumbers: number[], options: SendOptions = {}): Promise<ApiResult> {
    const response = await this.send('DELETE', endpoints.pim.employees, {
      data: { ids: empNumbers },
      ...options
    });
    return { response, body: await this.json(response) };
  }

  /**
   * The list endpoint is the only reliable way to look an employee up by name -
   * there is no "search by employeeId" route in the v2 API.
   */
  async findEmployeeByName({
    firstName,
    lastName
  }: Pick<Employee, 'firstName' | 'lastName'>): Promise<ApiResult & { match?: any }> {
    const query = new URLSearchParams({
      limit: '50',
      offset: '0',
      model: 'detailed',
      includeEmployees: 'onlyCurrent',
      sortField: 'employee.firstName',
      sortOrder: 'ASC',
      nameOrId: firstName
    });
    const response = await this.send('GET', `${endpoints.pim.employees}?${query}`);
    const body = await this.json(response);
    const match = (body?.data || []).find(
      (row: any) => row.firstName === firstName && row.lastName === lastName
    );
    return { response, body, match };
  }

  async createCandidate(candidate: Candidate): Promise<ApiResult> {
    const response = await this.send('POST', endpoints.recruitment.candidates, {
      data: {
        firstName: candidate.firstName,
        middleName: candidate.middleName || '',
        lastName: candidate.lastName,
        email: candidate.email,
        contactNumber: '',
        vacancyId: null,
        comment: '',
        dateOfApplication: candidate.dateOfApplication,
        consentToKeepData: false
      }
    });
    return { response, body: await this.json(response) };
  }

  async listCandidates({ limit = 50, offset = 0 } = {}): Promise<ApiResult> {
    const query = `limit=${limit}&offset=${offset}&model=list&sortField=candidate.dateOfApplication&sortOrder=DESC`;
    const response = await this.send('GET', `${endpoints.recruitment.candidates}?${query}`);
    return { response, body: await this.json(response) };
  }

  async deleteCandidates(ids: number[], options: SendOptions = {}): Promise<ApiResult> {
    const response = await this.send('DELETE', endpoints.recruitment.candidates, {
      data: { ids },
      ...options
    });
    return { response, body: await this.json(response) };
  }

  /**
   * `limit=0` is how this API asks for "all of them" - it is a lookup list, not
   * a page of records.
   */
  async listLeaveTypes(): Promise<ApiResult> {
    const response = await this.send('GET', `${endpoints.leave.types}?limit=0`);
    return { response, body: await this.json(response) };
  }

  async createUser({
    username,
    password,
    userRoleId,
    empNumber,
    status = true
  }: NewUser): Promise<ApiResult> {
    const response = await this.send('POST', endpoints.admin.users, {
      data: { username, password, status, userRoleId, empNumber }
    });
    return { response, body: await this.json(response) };
  }

  async deleteUsers(ids: number[], options: SendOptions = {}): Promise<ApiResult> {
    const response = await this.send('DELETE', endpoints.admin.users, {
      data: { ids },
      ...options
    });
    return { response, body: await this.json(response) };
  }

  /**
   * The instance wide language and date format. Anything that asserts on a date
   * shown in the UI has to read this first - on the shared demo the setting is
   * whatever the last person to change it left behind.
   */
  async getLocalization(): Promise<{
    response: APIResponse;
    dateFormat?: string;
    language?: string;
  }> {
    const response = await this.send('GET', endpoints.admin.localization);
    const body = await this.json(response);
    return { response, dateFormat: body?.data?.dateFormat, language: body?.data?.language };
  }

  async listAdminUsers(limit = 1): Promise<ApiResult> {
    const response = await this.send('GET', `${endpoints.admin.users}?limit=${limit}&offset=0`);
    return { response, body: await this.json(response) };
  }
}

export default ApiClient;
