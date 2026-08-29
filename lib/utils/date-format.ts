/**
 * OrangeHRM stores dates as ISO but renders them using the instance wide
 * localization setting (Admin > Configuration > Localization), which the API
 * exposes as a PHP date format string such as `Y-m-d` or `d/m/Y`.
 *
 * On the shared demo instance that setting is whatever the last person to touch
 * it left behind, so a test cannot assume a display format - it has to read the
 * one the instance is configured with and format the expected value the same way.
 */
interface DateParts {
  year: string;
  month: string;
  day: string;
}

const TOKENS: Record<string, (parts: DateParts) => string> = {
  Y: (parts) => parts.year,
  y: (parts) => parts.year.slice(-2),
  m: (parts) => parts.month,
  n: (parts) => String(Number(parts.month)),
  d: (parts) => parts.day,
  j: (parts) => String(Number(parts.day))
};

export const DEFAULT_FORMAT = 'Y-m-d';

/**
 * `isoDate` is `yyyy-mm-dd`, the format the API stores and accepts; `phpFormat`
 * is the instance's localization setting, e.g. `Y-m-d`, `d/m/Y`, `m-d-Y`.
 */
export const formatDate = (isoDate: string, phpFormat: string = DEFAULT_FORMAT): string => {
  const [year, month, day] = String(isoDate).split('-');
  if (!year || !month || !day) {
    throw new Error(`Expected an ISO date (yyyy-mm-dd) but got "${isoDate}"`);
  }

  const parts: DateParts = { year, month, day };

  return String(phpFormat)
    .split('')
    .map((character) => (TOKENS[character] ? TOKENS[character](parts) : character))
    .join('');
};
