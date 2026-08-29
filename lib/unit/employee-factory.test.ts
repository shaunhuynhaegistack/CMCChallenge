import test from 'node:test';
import assert from 'node:assert/strict';

import { buildEmployee, buildUsername, EMPLOYEE_ID_MAX_LENGTH } from '../utils/employee-factory';

test('employee ids stay within the length the application accepts', () => {
  // The API rejects a longer id with 422 while the UI silently truncates it, so
  // the limit has to hold for every generated record.
  for (let i = 0; i < 50; i += 1) {
    assert.ok(buildEmployee().employeeId.length <= EMPLOYEE_ID_MAX_LENGTH);
  }
});

test('generated employees are unique within a worker', () => {
  const ids = new Set();
  for (let i = 0; i < 25; i += 1) {
    ids.add(buildEmployee().employeeId);
  }
  assert.equal(ids.size, 25);
});

test('overrides win over the generated values', () => {
  const employee = buildEmployee({ firstName: 'Given', employeeId: 'FIXED1' });
  assert.equal(employee.firstName, 'Given');
  assert.equal(employee.employeeId, 'FIXED1');
  assert.match(employee.lastName, /^Candidate/);
});

test('the derived user name is lower case and prefixed', () => {
  const employee = buildEmployee({ employeeId: 'QA12345678' });
  assert.equal(buildUsername(employee), 'qa_qa12345678');
});
