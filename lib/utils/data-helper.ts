import fs from 'fs';
import path from 'path';
import environment from '../config/environment';
import type { UserCredentials } from '../BasePage';

const cache = new Map<string, unknown>();

/**
 * Reads a JSON fixture from `test-data/`. Files are cached because a parallel
 * run would otherwise re-read the same fixtures once per scenario.
 */
export const load = <T = Record<string, any>>(fileName: string): T => {
  if (cache.has(fileName)) return cache.get(fileName) as T;

  const filePath = path.join(process.cwd(), 'test-data', fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Test data file not found: ${filePath}`);
  }

  const content = JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  cache.set(fileName, content);
  return content;
};

/**
 * Credentials live in fixtures so the feature files stay readable, but the admin
 * account must be overridable from the environment - a real instance should
 * never have its password committed.
 */
export const resolveUser = (key: string): UserCredentials => {
  const user = load<Record<string, UserCredentials>>('users.json')[key];
  if (!user) {
    throw new Error(`Unknown user "${key}" in test-data/users.json`);
  }

  const isAdmin = key === 'admin';

  return {
    ...user,
    username: (isAdmin && environment.credentials.adminUsername) || user.username,
    password: (isAdmin && environment.credentials.adminPassword) || user.password
  };
};
