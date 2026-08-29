#!/usr/bin/env node
/**
 * Opens the HTML report in a browser.
 *
 * Not `open reports/.../index.html`: Chrome refuses to load the per-feature
 * pages over `file://` (ERR_ACCESS_DENIED), so the report looks broken the
 * moment you click into a feature. Serving the folder over localhost avoids
 * that. The server is detached so the report stays navigable after the command
 * returns.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';

const browser = (process.env.BROWSER || 'chromium').trim().toLowerCase();
const reportDir = path.resolve('reports', browser, 'html-report');
const indexPath = path.join(reportDir, 'index.html');
const port = Number(process.env.REPORT_PORT || 4173);

// Set on the detached copy of this script that actually serves the report.
const isServer = process.env.REPORT_SERVER_CHILD === '1';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon'
};

const createServer = () =>
  http.createServer((request, response) => {
    // decodeURIComponent throws on a malformed escape such as `/%`, and an
    // uncaught throw here kills the server rather than the request.
    let requested;
    try {
      requested = decodeURIComponent((request.url || '/').split('?')[0]);
    } catch {
      response.writeHead(400).end('Bad request');
      return;
    }

    // Normalised and re-checked against the root: a report server should not be
    // able to serve anything outside the report.
    const safe = path.normalize(requested).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(reportDir, safe === '/' ? 'index.html' : safe);

    if (!filePath.startsWith(reportDir)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
        response.writeHead(missing ? 404 : 500);
        response.end(missing ? 'Not found' : 'Server error');
        return;
      }

      response.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
      });
      response.end(data);
    });
  });

const ping = () =>
  new Promise((resolve) => {
    const request = http.get(
      { host: '127.0.0.1', port, path: '/index.html', timeout: 500 },
      (response) => {
        response.resume();
        resolve(true);
      }
    );
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });

const waitForServer = async (timeout = 8000): Promise<boolean> => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await ping()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
};

const openInBrowser = (url: string) => {
  const child =
    process.platform === 'win32'
      ? spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
      : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], {
          detached: true,
          stdio: 'ignore'
        });
  child.unref();
};

if (isServer) {
  const server = createServer();
  // Another copy already has the port; nothing to do.
  server.on('error', (error: NodeJS.ErrnoException) =>
    process.exit(error.code === 'EADDRINUSE' ? 0 : 1)
  );
  server.listen(port, '127.0.0.1');
} else {
  if (!fs.existsSync(indexPath)) {
    console.error(`No report at ${indexPath}. Run the suite and \`npm run report\` first.`);
    process.exit(1);
  }

  (async () => {
    const url = `http://127.0.0.1:${port}/index.html`;

    if (!(await ping())) {
      const child = spawn(process.execPath, [__filename], {
        env: { ...process.env, REPORT_SERVER_CHILD: '1' },
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    }

    if (!(await waitForServer())) {
      console.error(`The report server did not start on port ${port}. Open ${url} manually.`);
      process.exit(1);
    }

    openInBrowser(url);
    console.log(`Report open at ${url}`);
    console.log(`Serving ${reportDir} in the background.`);
    console.log(
      process.platform === 'win32'
        ? `Stop it with: netstat -ano | findstr :${port}  then  taskkill /PID <pid> /F`
        : `Stop it with: lsof -ti tcp:${port} | xargs kill`
    );
    process.exit(0);
  })();
}
