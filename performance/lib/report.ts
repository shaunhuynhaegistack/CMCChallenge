/**
 * Performance reporting.
 *
 * k6 prints its own end-of-test summary, but CI needs something it can publish
 * as an artifact and a human can open. `handleSummary` replaces the default
 * output with three things: a short console summary, the raw JSON, and a
 * self contained HTML page.
 *
 * Deliberately written without the remote jslib helpers so a run does not depend
 * on fetching a script from the internet.
 */
const RESULTS_DIR = 'performance/results';

/** The parts of k6's summary object this report reads. */
interface K6Metric {
  type: string;
  values: Record<string, number>;
  thresholds?: Record<string, boolean | { ok: boolean }>;
}

interface K6Data {
  metrics: Record<string, K6Metric>;
}

interface MetricRow {
  name: string;
  type: string;
  avg?: number;
  med?: number;
  p95?: number;
  p99?: number;
  max?: number;
  rate?: number;
  count?: number;
}

interface ThresholdRow {
  metric: string;
  expression: string;
  passed: boolean;
}

interface Summary {
  name: string;
  baseUrl: string;
  generatedAt: string;
  totalRequests: number;
  failureRate: number;
  p95Duration: number;
  thresholds: ThresholdRow[];
  metrics: MetricRow[];
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
};

const round = (value: number): number =>
  typeof value === 'number' ? Math.round(value * 100) / 100 : value;

const metricRows = (metrics: Record<string, K6Metric>): MetricRow[] =>
  Object.entries(metrics)
    .filter(
      ([, metric]) => metric.type === 'trend' || metric.type === 'rate' || metric.type === 'counter'
    )
    .map(([name, metric]) => ({
      name,
      type: metric.type,
      avg: round(metric.values.avg),
      med: round(metric.values.med),
      p95: round(metric.values['p(95)']),
      p99: round(metric.values['p(99)']),
      max: round(metric.values.max),
      rate: round(metric.values.rate),
      count: metric.values.count
    }));

const thresholdRows = (metrics: Record<string, K6Metric>): ThresholdRow[] =>
  Object.entries(metrics).flatMap(([name, metric]) =>
    Object.entries(metric.thresholds || {}).map(([expression, result]) => ({
      metric: name,
      expression,
      passed: typeof result === 'boolean' ? !result : Boolean(result.ok)
    }))
  );

const escapeHtml = (value: string): string =>
  String(value).replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);

const renderHtml = (name: string, summary: Summary): string => {
  const failed = summary.thresholds.filter((threshold) => !threshold.passed);
  const status = failed.length === 0 ? 'PASSED' : 'FAILED';

  const thresholdRowsHtml = summary.thresholds
    .map(
      (threshold) => `<tr class="${threshold.passed ? 'ok' : 'bad'}">
        <td>${escapeHtml(threshold.metric)}</td>
        <td><code>${escapeHtml(threshold.expression)}</code></td>
        <td>${threshold.passed ? 'passed' : 'failed'}</td>
      </tr>`
    )
    .join('');

  const metricRowsHtml = summary.metrics
    .map(
      (metric) => `<tr>
        <td>${escapeHtml(metric.name)}</td>
        <td>${metric.type}</td>
        <td>${metric.avg ?? '-'}</td>
        <td>${metric.med ?? '-'}</td>
        <td>${metric.p95 ?? '-'}</td>
        <td>${metric.p99 ?? '-'}</td>
        <td>${metric.max ?? '-'}</td>
        <td>${metric.rate ?? '-'}</td>
        <td>${metric.count ?? '-'}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>k6 - ${escapeHtml(name)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 2rem; color: #1f2328; }
  h1 { margin-bottom: 0.25rem; }
  .status { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 4px; font-weight: 600; color: #fff; }
  .PASSED { background: #1a7f37; }
  .FAILED { background: #cf222e; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; font-size: 0.9rem; }
  th, td { border: 1px solid #d0d7de; padding: 0.4rem 0.6rem; text-align: left; }
  th { background: #f6f8fa; }
  tr.bad td { background: #ffebe9; }
  tr.ok td { background: #f0fff4; }
  code { font-size: 0.85rem; }
</style>
</head>
<body>
<h1>k6 - ${escapeHtml(name)}</h1>
<p><span class="status ${status}">${status}</span></p>
<p>Base URL: <code>${escapeHtml(summary.baseUrl)}</code><br>
Generated: ${escapeHtml(summary.generatedAt)}</p>

<h2>Thresholds</h2>
<table><thead><tr><th>Metric</th><th>Threshold</th><th>Result</th></tr></thead>
<tbody>${thresholdRowsHtml}</tbody></table>

<h2>Metrics</h2>
<table><thead><tr><th>Metric</th><th>Type</th><th>avg</th><th>med</th><th>p95</th><th>p99</th><th>max</th><th>rate</th><th>count</th></tr></thead>
<tbody>${metricRowsHtml}</tbody></table>
</body>
</html>`;
};

const renderText = (name: string, summary: Summary): string => {
  const failed = summary.thresholds.filter((threshold) => !threshold.passed);
  const lines = [
    '',
    `k6 ${name}: ${failed.length === 0 ? 'PASSED' : `FAILED (${failed.length} threshold(s))`}`,
    `  requests   : ${summary.totalRequests}`,
    `  failure rate: ${summary.failureRate}`,
    `  p95 duration: ${summary.p95Duration} ms`
  ];

  failed.forEach((threshold) => {
    lines.push(`  ! ${threshold.metric} ${threshold.expression}`);
  });

  lines.push('');
  return lines.join('\n');
};

export function buildSummary(name: string, data: K6Data): Record<string, string> {
  const summary: Summary = {
    name,
    baseUrl: (__ENV.BASE_URL || 'https://opensource-demo.orangehrmlive.com').replace(/\/$/, ''),
    generatedAt: new Date().toISOString(),
    totalRequests: data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0,
    failureRate: round(data.metrics.http_req_failed ? data.metrics.http_req_failed.values.rate : 0),
    p95Duration: round(
      data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(95)'] : 0
    ),
    thresholds: thresholdRows(data.metrics),
    metrics: metricRows(data.metrics)
  };

  return {
    stdout: renderText(name, summary),
    [`${RESULTS_DIR}/${name}-summary.json`]: JSON.stringify(summary, null, 2),
    [`${RESULTS_DIR}/${name}-summary.html`]: renderHtml(name, summary),
    [`${RESULTS_DIR}/${name}-raw.json`]: JSON.stringify(data, null, 2)
  };
}
