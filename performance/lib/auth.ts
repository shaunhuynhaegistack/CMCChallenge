import http, { RefinedResponse, ResponseType } from 'k6/http';
import { check } from 'k6';
import { BASE_URL, CREDENTIALS, PATHS } from './config.ts';
import { logWarn } from './log.ts';

/**
 * OrangeHRM authenticates with a session cookie and a CSRF token that is
 * embedded in the login page markup, so a login is always two requests: fetch
 * the page to obtain the token, then post the credentials. Both are tagged so
 * the thresholds can talk about them separately.
 */
export function fetchCsrfToken(): string | null {
  const response = http.get(`${BASE_URL}${PATHS.loginPage}`, {
    tags: { endpoint: 'login_page' }
  });

  const match = response.body ? String(response.body).match(/:token="&quot;([^&]+)&quot;"/) : null;

  check(response, {
    'login page returns 200': (res) => res.status === 200,
    'login page exposes a CSRF token': () => match !== null
  });

  // A failure here is almost always the instance shedding load rather than a
  // bug, and without the status the summary only says the rate dropped.
  if (!match) {
    logWarn(`No CSRF token in the login page (status ${response.status})`);
  }

  return match ? match[1] : null;
}

export function login(): { ok: boolean; response: RefinedResponse<ResponseType> | null } {
  const token = fetchCsrfToken();
  if (!token) {
    return { ok: false, response: null };
  }

  const response = http.post(
    `${BASE_URL}${PATHS.validate}`,
    { _token: token, username: CREDENTIALS.username, password: CREDENTIALS.password },
    { redirects: 0, tags: { endpoint: 'validate' } }
  );

  // A successful login answers 302 to the dashboard. A failed one also answers
  // 302, but back to /auth/login, so the location has to be checked as well.
  const location = response.headers.Location || '';
  const ok = response.status === 302 && location.includes('/dashboard/index');

  check(response, {
    'validate returns a redirect': (res) => res.status === 302,
    'validate redirects to the dashboard': () => ok
  });

  if (!ok) {
    logWarn(
      `Login did not reach the dashboard (status ${response.status}, location "${location}")`
    );
  }

  return { ok, response };
}
