/**
 * Bringing the instance to a known state before the suite runs.
 *
 * OrangeHRM keeps the display language and the date format as *instance-wide*
 * settings under Admin > Configuration > Localization. On the public demo
 * anyone can change them, and both break a suite in ways that read like a code
 * defect:
 *
 *   - the language decides the label on every control. The suite addresses
 *     controls by the label a user reads, because the product ships no test id
 *     anywhere, so a switch to Spanish fails every scenario at the first click
 *     on a button that is perfectly visible and simply says `Ingresar`.
 *   - the date format decides how a stored date is rendered, so an assertion
 *     written against `1992-04-18` fails when the instance is showing
 *     `18/04/1992`.
 *
 * Both were observed on this instance within one evening. The fix is a
 * precondition rather than a workaround: put the two settings where the suite
 * expects them, say so in the log, and let the scenarios assume nothing.
 *
 * This runs with plain fetch rather than through ApiClient because it happens
 * before any browser exists - it is what makes the run possible, not part of it.
 */
import environment from '../config/environment';

/** ISO, which is also how the API stores dates - the least surprising choice. */
export const EXPECTED_DATE_FORMAT = 'Y-m-d';
export const EXPECTED_LANGUAGE = 'en_US';

const LOGIN_PAGE = '/web/index.php/auth/login';
const VALIDATE = '/web/index.php/auth/validate';
const LOCALIZATION = '/web/index.php/api/v2/admin/localization';

export interface Localization {
  language: string;
  dateFormat: string;
}

export interface NormaliseResult {
  before: Localization;
  after: Localization;
  changed: boolean;
}

/**
 * Signs in with the configured admin account and returns the session cookie.
 * OrangeHRM authenticates with a cookie and a CSRF token embedded in the login
 * page markup, so this is always two requests.
 */
export const signIn = async (baseUrl: string): Promise<string> => {
  const page = await fetch(`${baseUrl}${LOGIN_PAGE}`, { redirect: 'manual' });
  const markup = await page.text();
  const token = markup.match(/:token="&quot;([^&]+)&quot;"/);
  if (!token) {
    throw new Error('the login page did not contain a CSRF token - its markup has changed');
  }

  const cookie = (page.headers.get('set-cookie') || '').split(';')[0];
  const response = await fetch(`${baseUrl}${VALIDATE}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: new URLSearchParams({
      _token: token[1],
      username: environment.credentials.adminUsername || 'Admin',
      password: environment.credentials.adminPassword || 'admin123'
    })
  });

  const location = response.headers.get('location') || '';
  if (!location.includes('/dashboard/index')) {
    throw new Error(
      `sign in did not reach the dashboard (status ${response.status}, location "${location}"). ` +
        'Set ADMIN_USERNAME and ADMIN_PASSWORD if the demo credentials have changed.'
    );
  }

  return (response.headers.get('set-cookie') || '').split(';')[0] || cookie;
};

export const readLocalization = async (baseUrl: string, cookie: string): Promise<Localization> => {
  const response = await fetch(`${baseUrl}${LOCALIZATION}`, { headers: { Cookie: cookie } });
  if (!response.ok) {
    throw new Error(`the localization API returned ${response.status}`);
  }
  const { data } = (await response.json()) as { data: Localization };
  return data;
};

/**
 * Leaves the instance in English with an ISO date format. Returns what it found
 * as well as what it left, so the caller can report a change rather than making
 * it silently.
 */
export const normaliseLocalization = async (
  baseUrl: string,
  cookie: string
): Promise<NormaliseResult> => {
  const before = await readLocalization(baseUrl, cookie);
  const after: Localization = { language: EXPECTED_LANGUAGE, dateFormat: EXPECTED_DATE_FORMAT };
  const changed = before.language !== after.language || before.dateFormat !== after.dateFormat;

  if (!changed) return { before, after: before, changed: false };

  const response = await fetch(`${baseUrl}${LOCALIZATION}`, {
    method: 'PUT',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(after)
  });

  if (!response.ok) {
    throw new Error(
      `the instance is set to language "${before.language}" and date format ` +
        `"${before.dateFormat}", and neither could be reset (PUT returned ${response.status}). ` +
        'Every scenario would fail on a label or a date it cannot match. Set them under ' +
        'Admin > Configuration > Localization.'
    );
  }

  return { before, after, changed: true };
};
