import { logWarn } from '../logger';

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface WaitOptions {
  timeout?: number;
  interval?: number;
  description?: string;
}

/**
 * Polls `predicate` until it returns a truthy value or the timeout expires.
 *
 * Playwright's own auto-waiting covers element state, so this is only for the
 * cases it cannot see - a value that has to appear in an API response, a record
 * that a background job still has to write, and similar.
 */
export const waitUntil = async <T>(
  predicate: () => T | Promise<T>,
  { timeout = 15000, interval = 500, description = 'condition' }: WaitOptions = {}
): Promise<T> => {
  const deadline = Date.now() + timeout;
  let lastError: Error | undefined;

  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error as Error;
    }
    await sleep(interval);
  }

  const reason = lastError ? ` Last error: ${lastError.message}` : '';
  throw new Error(`Timed out after ${timeout}ms waiting for ${description}.${reason}`);
};

interface RetryOptions {
  attempts?: number;
  delay?: number;
  description?: string;
}

/**
 * Retries an operation with a linear backoff. Used for calls that can fail for
 * reasons unrelated to the assertion - the shared demo instance occasionally
 * answers a request with a gateway error under load.
 */
export const retryAsync = async <T>(
  operation: (attempt: number) => Promise<T>,
  { attempts = 3, delay = 1000, description = 'operation' }: RetryOptions = {}
): Promise<T> => {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error as Error;
      logWarn(`Attempt ${attempt}/${attempts} of ${description} failed: ${lastError.message}`);
      if (attempt < attempts) await sleep(delay * attempt);
    }
  }

  throw lastError;
};
