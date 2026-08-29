import { load } from '../lib/utils/data-helper';
import type { Employee } from '../lib/BasePage';

// The employee id column is limited to 10 characters. The API rejects anything
// longer with a 422 while the UI silently truncates it, so the limit is enforced
// here once instead of being rediscovered per test.
export const EMPLOYEE_ID_MAX_LENGTH = 10;

/**
 * OrangeHRM rejects duplicate employee ids, and the demo instance is shared, so
 * every scenario needs data that cannot collide with a parallel worker or with
 * leftovers from an earlier run.
 *
 * Three parts, because a timestamp alone is not enough:
 *   - the clock       separates one run from the next
 *   - the worker pid  separates parallel Cucumber workers
 *   - a sequence      separates two records built inside the same millisecond,
 *                     which a timestamp cannot do and which the unit test in
 *                     lib/unit/employee-factory.test.ts caught
 */
interface EmployeeTemplate {
  firstNamePrefix: string;
  middleName: string;
  lastNamePrefix: string;
}

let sequence = 0;

const base36 = (value: number, width: number): string =>
  Math.abs(Math.trunc(value)).toString(36).padStart(width, '0').slice(-width);

const clockPart = (): string => Date.now().toString(36).slice(-5);
const workerPart = (): string => base36(process.pid % 1296, 2);
const sequencePart = (): string => base36(sequence++ % 1296, 2);

// 1 + 5 + 2 + 2 = 10 characters, exactly the column width.
export const nextEmployeeId = (): string => `Q${clockPart()}${workerPart()}${sequencePart()}`;

/**
 * The same discriminator without the employee-id length limit, for records in
 * other modules that need to be unique but have their own field rules.
 */
export const uniqueSuffix = (): string => `${clockPart()}${workerPart()}${sequencePart()}`;

export const buildEmployee = (overrides: Partial<Employee> = {}): Employee => {
  const template = load<Record<string, EmployeeTemplate>>('employees.json').lifecycle;
  const employeeId = nextEmployeeId();

  // The names carry the same discriminator so that a search by employee name
  // also matches exactly one record.
  const discriminator = employeeId.slice(1);

  return {
    firstName: `${template.firstNamePrefix}${discriminator}`,
    middleName: template.middleName,
    lastName: `${template.lastNamePrefix}${discriminator.slice(-4)}`,
    employeeId,
    ...overrides
  };
};

export const buildUsername = (employee: Employee): string =>
  `qa_${employee.employeeId.toLowerCase()}`;
