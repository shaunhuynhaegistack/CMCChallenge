#!/usr/bin/env node
/**
 * Renders the k6 summaries as markdown for the workflow run page, so the load
 * test result is readable without downloading the artifact.
 */
import fs from 'fs';
import path from 'path';

/** One threshold line out of a k6 summary. */
interface Threshold {
  metric: string;
  expression: string;
  passed: boolean;
}

const RESULTS_DIR = path.join(process.cwd(), 'performance', 'results');

const summaries = fs.existsSync(RESULTS_DIR)
  ? fs.readdirSync(RESULTS_DIR).filter((file) => file.endsWith('-summary.json'))
  : [];

if (summaries.length === 0) {
  console.log('### k6 performance\n\nNo summaries were produced.');
  process.exit(0);
}

const lines = ['### k6 performance', ''];

summaries.forEach((file) => {
  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8'));
  } catch {
    return;
  }

  const failed = (summary.thresholds || []).filter((threshold: Threshold) => !threshold.passed);
  const icon = failed.length === 0 ? ':white_check_mark:' : ':warning:';

  lines.push(
    `#### ${icon} ${summary.name}`,
    '',
    `Requests **${summary.totalRequests}** · failure rate **${summary.failureRate}** · p95 **${summary.p95Duration} ms**`,
    '',
    '| Metric | Threshold | Result |',
    '| --- | --- | ---: |'
  );

  (summary.thresholds || []).forEach((threshold: Threshold) => {
    lines.push(
      `| ${threshold.metric} | \`${threshold.expression}\` | ${threshold.passed ? 'pass' : '**fail**'} |`
    );
  });

  lines.push('');
});

console.log(lines.join('\n'));
