#!/usr/bin/env node
/**
 * Builds the human readable HTML report from the Cucumber JSON.
 *
 * Three things beyond calling the reporter:
 *
 *   1. The JSON is sanitised into its own directory first. The reporter scans
 *      every `.json` under the directory it is given and assumes each one is a
 *      Cucumber report, so anything else in `reports/<browser>/` crashes it.
 *   2. The generated HTML is post-processed: the summary chart is given a stable
 *      layout (see chart-layout.ts), the tag and browser columns are made
 *      readable by custom-styles.css, and the reporter's own footer is replaced.
 *   3. Metadata is real - the engine version recorded during the run, the OS
 *      product version, and the branch and commit from CI or from git.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import reporter from 'multiple-cucumber-html-reporter';
import { applyChartLayout, CHART_LAYOUT_CSS } from '../../lib/reporting/chart-layout';

/** How one engine is labelled in the report header. */
interface BrowserDisplay {
  icon: string;
  name: string;
  reporterName: string;
}

/** The parts of a Cucumber JSON feature this script reads. */
interface CucumberFeature {
  uri?: string;
  name?: string;
  elements?: { steps?: { result?: { status?: string } }[] }[];
}

const REPORTS_DIR = path.join(process.cwd(), 'reports');
const PROJECT = 'OrangeHRM Automation';
const AUTHOR = 'shaunhuynhaegistack';

/**
 * `reporterName` has to be one the reporter recognises (chrome, firefox, safari,
 * edge) or it renders a question mark instead of a browser. Playwright's engine
 * names are not those, so they are mapped - the human readable name is kept
 * separately for the page title and the table.
 */
const BROWSER_DISPLAY: Record<string, BrowserDisplay> = {
  chromium: { icon: '🌐', name: 'Chromium', reporterName: 'chrome' },
  chrome: { icon: '🟢', name: 'Google Chrome', reporterName: 'chrome' },
  msedge: { icon: '🔵', name: 'Microsoft Edge', reporterName: 'edge' },
  firefox: { icon: '🦊', name: 'Firefox', reporterName: 'firefox' },
  webkit: { icon: '🧭', name: 'WebKit', reporterName: 'safari' },
  showcase: { icon: '🧪', name: 'Failure showcase', reporterName: 'chrome' }
};

const displayFor = (browser: string): BrowserDisplay =>
  BROWSER_DISPLAY[browser] || { icon: '🧭', name: browser, reporterName: 'chrome' };

/**
 * A feature without a uri or a name is not something the reporter can render -
 * it throws part way through and leaves a half written report. Dropping those
 * up front turns a crash into a warning.
 */
const isRenderableFeature = (feature: CucumberFeature) =>
  Boolean(
    feature &&
    typeof feature === 'object' &&
    typeof feature.uri === 'string' &&
    feature.uri.trim() &&
    typeof feature.name === 'string' &&
    feature.name.trim()
  );

const targetBrowser = () => (process.env.BROWSER || '').trim().toLowerCase();

const discoverResults = () => {
  if (!fs.existsSync(REPORTS_DIR)) return [];

  const only = targetBrowser();

  return fs
    .readdirSync(REPORTS_DIR)
    .filter((entry) => fs.statSync(path.join(REPORTS_DIR, entry)).isDirectory())
    .filter((entry) => fs.existsSync(path.join(REPORTS_DIR, entry, 'cucumber-report.json')))
    .filter((entry) => !only || entry.toLowerCase() === only);
};

/**
 * Copies the valid features into `cucumber-json/`, which is what the reporter is
 * pointed at. Returns null when there is nothing worth rendering.
 */
const prepareJson = (browser: string) => {
  const reportPath = path.join(REPORTS_DIR, browser);
  const sourceFile = path.join(reportPath, 'cucumber-report.json');
  const jsonDir = path.join(reportPath, 'cucumber-json');

  let parsed;
  try {
    const raw = fs.readFileSync(sourceFile, 'utf8').trim();
    if (!raw) {
      console.warn(`Skipping ${browser}: cucumber-report.json is empty.`);
      return null;
    }
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn(
      `Skipping ${browser}: could not parse cucumber-report.json (${(error as Error).message}).`
    );
    return null;
  }

  const all = Array.isArray(parsed) ? parsed : [parsed];
  const features = all.filter(isRenderableFeature);

  if (all.length !== features.length) {
    console.warn(
      `Dropped ${all.length - features.length} unrenderable feature(s) from ${browser}.`
    );
  }
  if (features.length === 0) {
    console.warn(`Skipping ${browser}: no renderable features.`);
    return null;
  }

  fs.rmSync(jsonDir, { recursive: true, force: true });
  fs.mkdirSync(jsonDir, { recursive: true });
  fs.writeFileSync(path.join(jsonDir, 'cucumber-report.json'), JSON.stringify(features, null, 2));

  return { reportPath, jsonDir };
};

const platformName = () => {
  switch (os.platform()) {
    case 'darwin':
      return 'osx';
    case 'win32':
      return 'windows';
    default:
      return 'linux';
  }
};

// os.release() is a kernel version and means nothing to a reader.
const platformVersion = () => {
  try {
    if (os.platform() === 'darwin') {
      return `macOS ${execSync('sw_vers -productVersion', { encoding: 'utf8' }).trim()}`;
    }
    if (os.platform() === 'linux' && fs.existsSync('/etc/os-release')) {
      const match = fs.readFileSync('/etc/os-release', 'utf8').match(/^PRETTY_NAME="?([^"\n]+)"?/m);
      if (match) return match[1];
    }
  } catch {
    // Fall through to the kernel version rather than failing the report.
  }
  return os.release();
};

/**
 * The engine version recorded by the Before hook of the run. Two fallbacks so
 * the report never says "unknown": the metadata file written beside the results,
 * then the version of the browser Playwright has installed locally.
 */
const engineVersion = (browser: string) => {
  const candidates = [
    path.join(REPORTS_DIR, browser, 'run-metadata.json'),
    path.join(REPORTS_DIR, 'metadata', `${browser}.json`)
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const version = JSON.parse(fs.readFileSync(file, 'utf8')).version;
      if (version) return version;
    } catch {
      // Try the next candidate rather than giving up.
    }
  }

  try {
    // Last resort: the installed Playwright version, which is the version the
    // engines were downloaded for.
    return (
      JSON.parse(fs.readFileSync(require.resolve('playwright/package.json'), 'utf8')) as {
        version: string;
      }
    ).version;
  } catch {
    return 'latest';
  }
};

const gitValue = (args: string, fallback: string): string => {
  try {
    return execSync(`git ${args}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return fallback;
  }
};

// Deliberately not os.hostname(): on a laptop that is often a LAN address, and
// the report is published as an artifact.
const executedOn = () => (process.env.CI ? 'GitHub Actions runner' : 'Local machine');

const runDate = () => {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
};

const runMetadata = () => [
  { label: 'Project', value: PROJECT },
  { label: 'Environment', value: process.env.ENV || 'demo' },
  { label: 'Base URL', value: process.env.BASE_URL || 'https://opensource-demo.orangehrmlive.com' },
  {
    label: 'Branch',
    value: process.env.GITHUB_REF_NAME || gitValue('rev-parse --abbrev-ref HEAD', 'unknown')
  },
  {
    label: 'Commit',
    value: (process.env.GITHUB_SHA || gitValue('rev-parse HEAD', 'unknown')).substring(0, 8)
  },
  { label: 'Triggered by', value: process.env.GITHUB_ACTOR || os.userInfo().username },
  { label: 'Executed on', value: executedOn() }
];

/**
 * Injected into every page. The reporter renders the browser column as a Font
 * Awesome icon that does not exist for Playwright's engines, so it is swapped
 * for an emoji and the engine name.
 */
const browserScript = (browser: string) => {
  const display = displayFor(browser);

  return `
(function () {
  'use strict';
  var icon = ${JSON.stringify(display.icon)};
  var name = ${JSON.stringify(display.name)};

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var style = document.createElement('style');
    style.textContent =
      'table.table tbody tr td:nth-child(7) i[class*="fa-"]:before {' +
      '  content: "' + icon + '" !important;' +
      '  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol" !important;' +
      '  font-size: 18px !important;' +
      '}';
    document.head.appendChild(style);

    document.querySelectorAll('p.navbar-text').forEach(function (node) {
      if (node.textContent && node.textContent.trim() === 'Multiple Cucumber HTML Reporter') {
        node.textContent = ${JSON.stringify(PROJECT)} + ' - ' + name;
      }
    });
  });
})();`;
};

const patchHtml = (html: string, browser: string, dateText: string) => {
  let updated = html.replace(
    /<div class="created-by">[\s\S]*?<\/div>/g,
    `<div class="created-by"><p>${PROJECT} - generated by ${AUTHOR}</p></div>`
  );

  updated = applyChartLayout(updated, dateText);

  // The reporter drops trailing customStyle rules from the per-feature pages, so
  // the chart lock is injected into each page rather than relied on once.
  if (!updated.includes('data-report-layout="v2"] td.chart')) {
    if (updated.includes('</style>')) {
      updated = updated.replace('</style>', `${CHART_LAYOUT_CSS}\n</style>`);
    } else if (updated.includes('</head>')) {
      updated = updated.replace('</head>', `<style>${CHART_LAYOUT_CSS}</style>\n</head>`);
    }
  }

  if (updated.includes('</body>') && !updated.includes('browser-column-fix')) {
    updated = updated.replace(
      '</body>',
      `<script data-name="browser-column-fix">${browserScript(browser)}</script>\n</body>`
    );
  }

  return updated;
};

const patchDirectory = (dir: string, browser: string, dateText: string) => {
  if (!fs.existsSync(dir)) return;

  fs.readdirSync(dir)
    .filter((file) => file.endsWith('.html'))
    .forEach((file) => {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const updated = patchHtml(content, browser, dateText);
      if (updated !== content) fs.writeFileSync(filePath, updated, 'utf8');
    });
};

const browsers = discoverResults();

if (browsers.length === 0) {
  console.error('No cucumber JSON found under reports/. Run the suite first.');
  process.exit(1);
}

const dateText = runDate();

browsers.forEach((browser) => {
  const prepared = prepareJson(browser);
  if (!prepared) return;

  const htmlDir = path.join(prepared.reportPath, 'html-report');
  // A stale page from an earlier run would keep its old chart markup.
  fs.rmSync(htmlDir, { recursive: true, force: true });

  reporter.generate({
    jsonDir: prepared.jsonDir,
    reportPath: htmlDir,
    pageTitle: PROJECT,
    reportName: `${PROJECT} - ${displayFor(browser).name}`,
    displayDuration: true,
    displayReportTime: true,
    metadata: {
      browser: { name: displayFor(browser).reporterName, version: engineVersion(browser) },
      device: executedOn(),
      platform: { name: platformName(), version: platformVersion() }
    },
    customData: { title: 'Run info', data: runMetadata() },
    customStyle: path.join(__dirname, 'custom-styles.css')
  });

  patchDirectory(htmlDir, browser, dateText);
  patchDirectory(path.join(htmlDir, 'features'), browser, dateText);

  console.log(`HTML report written to ${path.join(htmlDir, 'index.html')}`);
});

console.log('Chrome blocks the feature pages over file://. Use `npm run report:open`.');
