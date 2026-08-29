/**
 * Post-processing for the generated HTML report.
 *
 * multiple-cucumber-html-reporter renders the summary as a chart, a status list
 * and a progress list side by side, and lets Chart.js size its own canvas. Two
 * things go wrong with that: the doughnut grows on every re-render until the
 * panel drifts, and the status and progress columns do not line up with each
 * other. Both are fixed by rewriting that one table into a stable layout and
 * pinning the canvas size.
 *
 * The rewrite is idempotent - it tags the table it produced - so running the
 * generator twice over the same output is harmless.
 */
const CHART_LAYOUT_MARKER = 'data-report-layout="v2"';

const CHART_LAYOUT_CSS = `
/* Locks the summary chart so Chart.js cannot grow the canvas on re-render. */
table.chart[data-report-layout="v2"] {
    width: auto !important;
    border-collapse: collapse !important;
}
table.chart[data-report-layout="v2"] > tr > th,
table.chart[data-report-layout="v2"] > tr > td,
table.chart[data-report-layout="v2"] > tbody > tr > th,
table.chart[data-report-layout="v2"] > tbody > tr > td {
    vertical-align: middle !important;
    text-align: left !important;
    padding: 4px 16px !important;
}
table.chart[data-report-layout="v2"] > tr > td:first-child,
table.chart[data-report-layout="v2"] > tbody > tr > td:first-child {
    padding: 0 !important;
}
table.chart[data-report-layout="v2"] th {
    font-weight: 600 !important;
    font-size: 14px !important;
    padding-top: 0 !important;
    padding-bottom: 6px !important;
    vertical-align: bottom !important;
}
table.chart[data-report-layout="v2"] td.chart {
    position: relative !important;
    width: 140px !important;
    height: 140px !important;
    padding: 0 !important;
    overflow: visible !important;
    box-sizing: content-box !important;
}
table.chart[data-report-layout="v2"] td.chart #feature-chart,
table.chart[data-report-layout="v2"] td.chart #scenario-chart {
    width: 140px !important;
    height: 140px !important;
    max-width: 140px !important;
    max-height: 140px !important;
    margin: 0 !important;
    display: block !important;
}
table.chart[data-report-layout="v2"] td.chart .total {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 140px !important;
    height: 140px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 2em !important;
    line-height: 1 !important;
    pointer-events: none !important;
}
table.chart[data-report-layout="v2"] .report-status-progress-header {
    display: flex !important;
    align-items: center !important;
    width: 100% !important;
}
table.chart[data-report-layout="v2"] .report-status-header { min-width: 110px !important; padding-right: 24px !important; }
table.chart[data-report-layout="v2"] .report-pair-table { border: 0 !important; border-collapse: collapse !important; width: auto !important; }
table.chart[data-report-layout="v2"] .report-pair-table td {
    border: 0 !important;
    padding: 6px 0 !important;
    vertical-align: middle !important;
    font-size: 14px !important;
    height: 28px !important;
}
table.chart[data-report-layout="v2"] .report-pair-table td.report-status-cell { padding-right: 24px !important; white-space: nowrap !important; min-width: 110px !important; }
table.chart[data-report-layout="v2"] .report-pair-table td.report-progress-cell { white-space: nowrap !important; min-width: 70px !important; }
table.chart[data-report-layout="v2"] .report-meta-stack {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    font-size: 14px !important;
    white-space: nowrap !important;
}
.row .x_panel.fixed_height_320 { height: 320px !important; min-height: 320px !important; }
`;

// "00:02:16.537" reads as noise; the milliseconds never matter in a summary.
const trimMilliseconds = (duration: string): string => {
  const cleaned = duration.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(\d{1,2}:\d{2}:\d{2})(?:[.,]\d+)?$/);
  return match ? match[1] : cleaned.replace(/[.,]\d+$/, '');
};

const extractStatusRows = (tableHtml: string) => {
  const rows = [];
  const tileInfo = tableHtml.match(/<table class="tile_info">([\s\S]*?)<\/table>/i);

  if (tileInfo) {
    const rowPattern =
      /<tr>\s*<td>([\s\S]*?)<\/td>\s*<td class="percentage">([\s\S]*?)<\/td>\s*<\/tr>/gi;
    let match;
    while ((match = rowPattern.exec(tileInfo[1])) !== null) {
      rows.push({
        status: match[1].trim(),
        progress: match[2].replace(/\s+/g, ' ').trim()
      });
    }
  }

  return rows;
};

const rewriteChartTable = (tableHtml: string, dateText: string) => {
  if (!tableHtml.includes('id="scenario-chart"')) return tableHtml;
  if (tableHtml.includes(CHART_LAYOUT_MARKER)) return tableHtml;

  const durationMatch =
    tableHtml.match(/<th>\s*Total duration:\s*<\/th>\s*<tr>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/i) ||
    tableHtml.match(/<th>\s*Total duration:\s*<\/th>\s*<td>([\s\S]*?)<\/td>/i) ||
    tableHtml.match(/Total duration:\s*(\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?)/i);

  const rawDuration = (durationMatch?.[1] || '').replace(/\s+/g, ' ').trim();
  const chartCell = tableHtml.match(/<td class="chart">[\s\S]*?<\/td>/i)?.[0];
  const statusRows = extractStatusRows(tableHtml);

  if (!rawDuration || !chartCell || statusRows.length === 0) return tableHtml;

  const pairs = statusRows
    .map(
      (row) => `<tr>
            <td class="report-status-cell">${row.status}</td>
            <td class="report-progress-cell">${row.progress}</td>
          </tr>`
    )
    .join('\n');

  return `<table class="chart" ${CHART_LAYOUT_MARKER}>
    <tr>
      <th><p>Chart</p></th>
      <th colspan="2">
        <div class="report-status-progress-header">
          <span class="report-status-header">Status</span>
          <span class="report-progress-header">Progress</span>
        </div>
      </th>
      <th>Duration / Date</th>
    </tr>
    <tr>
      ${chartCell}
      <td colspan="2"><table class="report-pair-table">${pairs}</table></td>
      <td class="report-meta-col">
        <div class="report-meta-stack">
          <div>Total duration: ${trimMilliseconds(rawDuration)}</div>
          <div>Date: ${dateText}</div>
        </div>
      </td>
    </tr>
  </table>`;
};

/**
 * Walks the document rewriting every summary chart table. The tables nest, so
 * the closing tag is matched by depth rather than by the first `</table>`.
 */
const applyChartLayout = (html: string, dateText: string) => {
  const marker = 'id="scenario-chart"';
  let result = html;
  let searchFrom = 0;

  for (;;) {
    const canvasIndex = result.indexOf(marker, searchFrom);
    if (canvasIndex < 0) break;

    const tableStart = result.lastIndexOf('<table class="chart"', canvasIndex);
    if (tableStart < 0) {
      searchFrom = canvasIndex + marker.length;
      continue;
    }

    let depth = 0;
    let cursor = tableStart;
    let tableEnd = -1;

    while (cursor < result.length) {
      const nextOpen = result.indexOf('<table', cursor + 1);
      const nextClose = result.indexOf('</table>', cursor);
      if (nextClose < 0) break;

      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth += 1;
        cursor = nextOpen;
        continue;
      }
      if (depth === 0) {
        tableEnd = nextClose + '</table>'.length;
        break;
      }
      depth -= 1;
      cursor = nextClose + '</table>'.length;
    }

    if (tableEnd < 0) break;

    const rewritten = rewriteChartTable(result.slice(tableStart, tableEnd), dateText);
    result = result.slice(0, tableStart) + rewritten + result.slice(tableEnd);
    searchFrom = tableStart + rewritten.length;
  }

  return result;
};

export { applyChartLayout, CHART_LAYOUT_CSS, CHART_LAYOUT_MARKER };
