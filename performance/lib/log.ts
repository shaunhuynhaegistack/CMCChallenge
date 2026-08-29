/**
 * Console logging for the k6 scripts.
 *
 * Same shape and colours as the end-to-end suite's logger (`lib/logger.ts`), so
 * a CI log reads the same whichever job you are looking at. k6 runs its own
 * runtime, so this cannot import that module - it is a deliberate small copy
 * rather than a shared abstraction across two incompatible environments.
 */
const COLOURS: Record<string, string> = {
  reset: '\x1b[0m',
  action: '',
  verify: '\x1b[94m',
  info: '\x1b[35m',
  warn: '\x1b[33m',
  error: '\x1b[31m'
};

const LEVEL_WIDTH = 12;

interface RunHeader {
  name: string;
  baseUrl: string;
  profile: string;
  peakVus: number;
}

interface RunFooter {
  name: string;
  startedAt: number;
}

const write = (level: string, colour: string, message: string): void => {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[k6] - ${stamp} - ${level.padEnd(LEVEL_WIDTH)}--- ${message}`;
  console.log(colour ? `${colour}${line}${COLOURS.reset}` : line);
};

export const logAction = (message: string): void => write('Action', COLOURS.action, message);
export const logVerify = (message: string): void => write('Verify', COLOURS.verify, message);
export const logInfo = (message: string): void => write('Info', COLOURS.info, message);
export const logWarn = (message: string): void => write('Warn', COLOURS.warn, message);
export const logError = (message: string): void => write('Error', COLOURS.error, message);

/**
 * Printed once per script from `setup()`, so a CI log says what was run against
 * what before the progress bars start.
 */
export const logRunHeader = ({ name, baseUrl, profile, peakVus }: RunHeader): void => {
  logInfo(`Load test: ${name}`);
  logInfo(`  target  : ${baseUrl}`);
  logInfo(`  profile : ${profile}`);
  logInfo(`  peak VUs: ${peakVus}`);
};

/**
 * Printed once from `teardown()`. k6's own end-of-test summary is replaced by
 * handleSummary, so without this the log ends on a progress bar.
 */
export const logRunFooter = ({ name, startedAt }: RunFooter): void => {
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  logInfo(`Finished ${name} in ${seconds}s - summary written to performance/results/`);
};
