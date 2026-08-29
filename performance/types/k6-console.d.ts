/**
 * k6 provides `console`, but @types/k6 does not declare it and the DOM library
 * is not appropriate here - it would pull in a browser's globals as well.
 */
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
