import environment from './config/environment';

/**
 * Console logger.
 *
 * A JavaScript port of the `log.ts` used on the other projects, kept
 * deliberately faithful: same line shape, same level names, same colours, so a
 * CI log from this suite reads exactly like one from those.
 *
 *   [chromium] - 8/29/2026, 9:41:03 AM - Verify       --- Login alert: "Invalid credentials"
 *
 * Colour carries the level, because that is what the eye scans for across a few
 * thousand lines: verifications stand out from the actions that led to them, and
 * context stays quiet. GitHub Actions renders these codes, so the log looks the
 * same in the browser as in a terminal.
 */
const COLOURS = {
  verify: '\x1b[94m',
  info: '\x1b[35m',
  warning: '\x1b[33m',
  error: '\x1b[31m',
  reset: '\x1b[0m'
};

const LEVEL_WIDTH = 12;

const browserType = () =>
  process.env.BROWSER || process.env.PLAYWRIGHT_BROWSER || environment.execution.browser;

/**
 * `stream` is stderr for errors, so a shell can separate them from the run's
 * narrative.
 */
const write = (
  level: string,
  message: string,
  colour?: string,
  stream: NodeJS.WritableStream = process.stdout
): void => {
  const line = `[${browserType()}] - ${new Date().toLocaleString()} - ${level.padEnd(LEVEL_WIDTH, ' ')} --- ${message}\n`;
  stream.write(colour ? `${colour}${line}${COLOURS.reset}` : line);
};

/** Something the test did to the application. */
export const logAction = (message: string): void => write('Action', message);

/** Something the test checked, with the expected and actual values. */
export const logVerify = (message: string): void => write('Verify', message, COLOURS.verify);

/** Context: configuration, ids, API calls. */
export const logInfo = (message: string): void => write('Info', message, COLOURS.info);

export const logWarn = (message: string): void => write('Warning', message, COLOURS.warning);

export const logError = (message: string): void =>
  write('Error', message, COLOURS.error, process.stderr);
