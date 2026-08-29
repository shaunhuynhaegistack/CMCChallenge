import test from 'node:test';
import assert from 'node:assert/strict';

import { resolve } from '../config/environment';

const withEnv = (overrides: Record<string, string>, assertion: () => void): void => {
  const original = { ...process.env };
  Object.assign(process.env, overrides);
  try {
    assertion();
  } finally {
    process.env = original;
  }
};

test('the environment file supplies the defaults', () => {
  withEnv({ ENV: 'ci', RETRY: '', WORKERS: '', BASE_URL: '' }, () => {
    const environment = resolve();
    assert.equal(environment.name, 'ci');
    assert.equal(environment.execution.retries, 2);
    assert.equal(environment.execution.workers, 4);
  });
});

test('environment variables win over the environment file', () => {
  withEnv({ ENV: 'ci', RETRY: '5', BASE_URL: 'https://example.test/' }, () => {
    const environment = resolve();
    assert.equal(environment.execution.retries, 5);
    // A trailing slash would produce '//web/index.php' in every URL.
    assert.equal(environment.baseUrl, 'https://example.test');
  });
});

test('an unknown environment fails loudly and lists what exists', () => {
  withEnv({ ENV: 'does-not-exist' }, () => {
    assert.throws(() => resolve(), /Unknown environment "does-not-exist".*demo/s);
  });
});
