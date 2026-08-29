#!/usr/bin/env node
import { collect, combine, formatDuration } from '../../lib/reporting/summary';

const results = collect();

if (results.length === 0) {
  console.log('### OrangeHRM automation\n\nNo results were produced.');
  process.exit(0);
}

const overall = combine(results);
const icon = overall.failed === 0 ? ':white_check_mark:' : ':x:';

const lines = [
  `### ${icon} OrangeHRM automation - ${overall.failed === 0 ? 'passed' : 'failed'}`,
  '',
  '| Browser | Scenarios | Passed | Failed | Skipped | Duration |',
  '| --- | ---: | ---: | ---: | ---: | ---: |'
];

results.forEach(({ browser, totals }) => {
  lines.push(
    `| ${browser} | ${totals.scenarios} | ${totals.passed} | ${totals.failed} | ${totals.skipped} | ${formatDuration(totals.durationMs)} |`
  );
});

lines.push(
  `| **total** | **${overall.scenarios}** | **${overall.passed}** | **${overall.failed}** | **${overall.skipped}** | **${formatDuration(overall.durationMs)}** |`
);

const failures = results.flatMap(({ browser, failedScenarios }) =>
  failedScenarios.map((failure) => `- \`${browser}\` ${failure.feature} - ${failure.scenario}`)
);

if (failures.length) {
  lines.push('', '#### Failed scenarios', '', ...failures);
}

console.log(lines.join('\n'));
