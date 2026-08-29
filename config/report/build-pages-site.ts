#!/usr/bin/env node
/**
 * Builds the landing page for the published report site.
 *
 * The CI job downloads every browser's HTML report and the k6 summaries into one
 * directory; this writes an index over them so the site opens on something
 * readable rather than on a directory listing.
 */
import fs from 'fs';
import path from 'path';

const SITE_DIR = process.env.SITE_DIR || 'site';
import { collect, combine, formatDuration } from '../../lib/reporting/summary';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
};

const escapeHtml = (value: string): string =>
  String(value).replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);

const browserReports = () =>
  fs.existsSync(SITE_DIR)
    ? fs
        .readdirSync(SITE_DIR)
        .filter((entry) => fs.existsSync(path.join(SITE_DIR, entry, 'index.html')))
    : [];

// The showcase is a deliberate failure and must not be counted in the pass/fail
// table, so it is linked separately and excluded from reports/ before the
// summary is taken.

const performanceReports = () => {
  const dir = path.join(SITE_DIR, 'performance');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith('.html')) : [];
};

const results = collect();
const totals = combine(results);
const passed = totals.failed === 0 && totals.scenarios > 0;

const rows = results
  .map(
    (result) => `<tr>
      <td><a href="${escapeHtml(result.browser)}/index.html">${escapeHtml(result.browser)}</a></td>
      <td>${result.totals.scenarios}</td>
      <td class="ok">${result.totals.passed}</td>
      <td class="${result.totals.failed ? 'bad' : ''}">${result.totals.failed}</td>
      <td>${formatDuration(result.totals.durationMs)}</td>
    </tr>`
  )
  .join('');

const showcaseLink = fs.existsSync(path.join(SITE_DIR, 'failure-showcase', 'index.html'))
  ? '<li><a href="failure-showcase/index.html">Failure showcase report</a> - with the screenshot attached to the failing step</li>'
  : '<li>Not included in this run</li>';

const perfLinks = performanceReports()
  .map((file) => `<li><a href="performance/${escapeHtml(file)}">${escapeHtml(file)}</a></li>`)
  .join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OrangeHRM Automation - latest run</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0 auto; max-width: 60rem; padding: 2rem 1.5rem; color: #1f2328; }
  h1 { margin-bottom: 0.25rem; }
  .status { display: inline-block; padding: 0.25rem 0.7rem; border-radius: 4px; font-weight: 600; color: #fff; }
  .pass { background: #1a7f37; } .fail { background: #cf222e; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { border: 1px solid #d0d7de; padding: 0.5rem 0.7rem; text-align: left; }
  th { background: #f6f8fa; }
  td.ok { color: #1a7f37; } td.bad { color: #cf222e; font-weight: 600; }
  .meta { color: #57606a; font-size: 0.9rem; }
  ul { line-height: 1.8; }
</style>
</head>
<body>
<h1>OrangeHRM Automation</h1>
<p><span class="status ${passed ? 'pass' : 'fail'}">${passed ? 'PASSED' : 'FAILED'}</span></p>
<p class="meta">
  Environment <code>${escapeHtml(process.env.ENV || 'ci')}</code> ·
  Branch <code>${escapeHtml(process.env.GITHUB_REF_NAME || 'main')}</code> ·
  Commit <code>${escapeHtml((process.env.GITHUB_SHA || 'local').substring(0, 8))}</code> ·
  ${escapeHtml(new Date().toISOString().replace('T', ' ').slice(0, 19))} UTC
</p>

<h2>End to end</h2>
<table>
  <thead><tr><th>Browser</th><th>Scenarios</th><th>Passed</th><th>Failed</th><th>Duration</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="5">No results</td></tr>'}</tbody>
</table>

<h2>What a failure looks like</h2>
<p class="meta">
  A scenario that fails on purpose, published so the failure path can be seen
  without waiting for a real failure. It is excluded from every normal run.
</p>
<ul>${showcaseLink}</ul>

<h2>Performance</h2>
<ul>${perfLinks || '<li>No k6 summaries in this run</li>'}</ul>

<p class="meta">
  Published from <code>.github/workflows/ci.yml</code> on every push to <code>main</code>.
  Screenshots, videos and Playwright traces of failed scenarios are attached to the
  workflow run as artifacts.
</p>
</body>
</html>`;

fs.mkdirSync(SITE_DIR, { recursive: true });
fs.writeFileSync(path.join(SITE_DIR, 'index.html'), html);
console.log(`Site index written for ${browserReports().length} browser report(s).`);
