#!/usr/bin/env node
/**
 * Packs a run's artifacts into one zip.
 *
 * The point is a single file somebody can be handed - in Slack, in a ticket, as
 * a CI artifact - that contains the HTML report and the evidence together,
 * rather than a folder of loose files they have to reassemble.
 *
 *   npm run report:zip -- [browser]
 */
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const resolveBrowser = (input: string) => {
  const browser = (input || process.env.BROWSER || 'chromium').trim().toLowerCase();
  if (!browser) throw new Error('A browser name is required to zip the artifacts.');
  return browser;
};

// Sortable, readable, and unique enough that two runs in the same minute do not
// overwrite each other.
const buildFileName = (browser: string, date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    'report',
    browser,
    `${pad(date.getDate())}${MONTHS[date.getMonth()]}${date.getFullYear()}`,
    `${pad(date.getHours())}h${pad(date.getMinutes())}m${pad(date.getSeconds())}s`
  ].join('-');
};

const uniquePath = (baseName: string) => {
  const dir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(dir, { recursive: true });

  let fullPath = path.join(dir, `${baseName}.zip`);
  let attempt = 1;
  while (fs.existsSync(fullPath)) {
    fullPath = path.join(dir, `${baseName}-${attempt}.zip`);
    attempt += 1;
  }
  return fullPath;
};

const zipArtifacts = async (browserName: string) => {
  const browser = resolveBrowser(browserName);
  const sources = [
    { from: path.join('reports', browser), as: `reports/${browser}` },
    { from: 'performance/results', as: 'performance-results' }
  ].filter((source) => fs.existsSync(source.from) && fs.statSync(source.from).isDirectory());

  if (sources.length === 0) {
    throw new Error(`Nothing to zip for "${browser}". Run the suite and \`npm run report\` first.`);
  }

  const fullPath = uniquePath(buildFileName(browser, new Date()));
  const output = fs.createWriteStream(fullPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  sources.forEach((source) => {
    console.log(`Adding ${source.from}`);
    archive.directory(source.from, source.as);
  });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const kb = (fs.statSync(fullPath).size / 1024).toFixed(1);
      console.log(`Wrote ${fullPath} (${kb} KB)`);
      resolve(fullPath);
    });
    archive.on('error', reject);
    archive.pipe(output);
    archive.finalize();
  });
};

module.exports = { zipArtifacts };

if (require.main === module) {
  zipArtifacts(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
