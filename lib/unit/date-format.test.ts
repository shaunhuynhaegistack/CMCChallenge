import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDate, DEFAULT_FORMAT } from '../utils/date-format';

test('renders an ISO date in each format the application offers', () => {
  const cases = {
    'Y-m-d': '1992-04-18',
    'd-m-Y': '18-04-1992',
    'm-d-Y': '04-18-1992',
    'Y-d-m': '1992-18-04',
    'd/m/Y': '18/04/1992',
    'm/d/Y': '04/18/1992',
    'Y/m/d': '1992/04/18',
    'd.m.Y': '18.04.1992',
    'Y.m.d': '1992.04.18'
  };

  Object.entries(cases).forEach(([format, expected]) => {
    assert.equal(formatDate('1992-04-18', format), expected, `format ${format}`);
  });
});

test('supports the unpadded and two digit year tokens', () => {
  assert.equal(formatDate('1992-04-08', 'j/n/y'), '8/4/92');
});

test('falls back to the ISO format when none is given', () => {
  assert.equal(formatDate('1992-04-18'), '1992-04-18');
  assert.equal(DEFAULT_FORMAT, 'Y-m-d');
});

test('rejects anything that is not an ISO date', () => {
  assert.throws(() => formatDate('18/04/1992', 'Y-m-d'), /Expected an ISO date/);
});
