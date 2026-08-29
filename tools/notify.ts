#!/usr/bin/env node
/**
 * Posts the outcome of a run to Slack and/or Microsoft Teams.
 *
 * Nothing here is required for the suite to work: if no webhook is configured
 * the script logs that and exits successfully, so the pipeline behaves the same
 * whether or not a team has wired up notifications.
 *
 * Configuration (environment variables) - Slack accepts either style:
 *   SLACK_BOT_TOKEN + SLACK_CHANNEL_ID   a bot posting with chat.postMessage
 *   SLACK_WEBHOOK_URL                    an incoming webhook
 *   TEAMS_WEBHOOK_URL                    Teams workflow (Power Automate) webhook
 *   REPORT_ZIP_PATH                      a zipped report to upload, optional
 *   RUN_STARTED_AT                       ISO start of the run, optional
 *
 * With a bot token the zipped report is uploaded to the channel as well, so
 * anyone in it can download the report without a GitHub account.
 *
 * Usage:
 *   npm run notify            # send to whatever is configured
 *   npm run notify -- --dry-run  # print the payloads instead
 */
import fs from 'fs';
import path from 'path';
import { collect, combine, formatDuration } from '../lib/reporting/summary';

const DRY_RUN = process.argv.includes('--dry-run');

/** Everything the two message formats below need, gathered once. */
interface Report {
  repository: string;
  branch: string;
  actor: string;
  environment: string;
  runUrl: string | null;
  artifactsUrl: string | null;
  passed: boolean;
  empty: boolean;
  totals: ReturnType<typeof combine>;
  browsers: string;
  duration: string;
  start: string;
  end: string;
  failures: string[];
}

interface Target {
  label: string;
  payload: unknown;
  send: (payload: any) => Promise<void>;
}

const context = () => {
  const repository = process.env.GITHUB_REPOSITORY || 'local run';
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const runId = process.env.GITHUB_RUN_ID;

  return {
    repository,
    branch: process.env.GITHUB_REF_NAME || 'local',
    actor: process.env.GITHUB_ACTOR || process.env.USER || 'unknown',
    environment: process.env.ENV || 'demo',
    runUrl: runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : null,
    // Artifacts are listed at the bottom of the run page; there is no stable
    // per-artifact URL that works before the run has finished.
    artifactsUrl: runId ? `${serverUrl}/${repository}/actions/runs/${runId}#artifacts` : null
  };
};

const asUtc = (date: Date): string => `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;

const buildReport = (): Report => {
  const results = collect();
  const totals = combine(results);
  const meta = context();

  const finishedAt = new Date();
  const startedAt = process.env.RUN_STARTED_AT
    ? new Date(process.env.RUN_STARTED_AT)
    : new Date(finishedAt.getTime() - totals.durationMs);

  return {
    ...meta,
    passed: totals.failed === 0 && totals.scenarios > 0,
    empty: totals.scenarios === 0,
    totals,
    browsers: results.map((result) => result.browser).join(', ') || 'none',
    duration: formatDuration(totals.durationMs),
    start: asUtc(startedAt),
    end: asUtc(finishedAt),
    failures: results.flatMap(({ browser, failedScenarios }) =>
      failedScenarios.map((failure) => `${browser}: ${failure.scenario}`)
    )
  };
};

const headline = (report: Report): string => {
  if (report.empty) return 'OrangeHRM Automation produced no results';
  return report.passed ? 'OrangeHRM Automation Passed' : 'OrangeHRM Automation Failed';
};

const bodyText = (report: Report): string => {
  if (report.empty) return 'The run finished without producing any scenario results.';
  if (report.passed) {
    return `All ${report.totals.scenarios} scenarios passed.`;
  }

  const listed = report.failures.slice(0, 5).map((failure) => `• ${failure}`);
  const remaining = report.failures.length - listed.length;
  if (remaining > 0) listed.push(`• …and ${remaining} more`);

  return [
    `${report.totals.failed} of ${report.totals.scenarios} scenarios failed.`,
    ...listed
  ].join('\n');
};

const slackPayload = (report: Report) => {
  const icon = report.passed ? ':white_check_mark:' : ':x:';

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${report.passed ? '✅' : '❌'} ${headline(report)}`,
        emoji: true
      }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Repository*\n\`${report.repository}\`` },
        { type: 'mrkdwn', text: `*Branch*\n\`${report.branch}\`` },
        { type: 'mrkdwn', text: `*Browsers*\n\`${report.browsers}\`` },
        { type: 'mrkdwn', text: `*Duration*\n\`${report.duration}\`` },
        { type: 'mrkdwn', text: `*Start*\n${report.start}` },
        { type: 'mrkdwn', text: `*End*\n${report.end}` }
      ]
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Environment \`${report.environment}\` · Triggered by *${report.actor}*`
        }
      ]
    },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: bodyText(report) } }
  ];

  const actions: Record<string, unknown>[] = [];
  if (report.runUrl) {
    actions.push({
      type: 'button',
      text: { type: 'plain_text', text: 'View Run' },
      url: report.runUrl,
      style: report.passed ? 'primary' : 'danger'
    });
  }
  if (report.artifactsUrl) {
    actions.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Download Report' },
      url: report.artifactsUrl
    });
  }
  if (actions.length) blocks.push({ type: 'actions', elements: actions });

  return { text: `${icon} ${headline(report)}`, blocks };
};

const teamsPayload = (report: Report) => {
  const facts = [
    { title: 'Repository', value: report.repository },
    { title: 'Branch', value: report.branch },
    { title: 'Browsers', value: report.browsers },
    { title: 'Environment', value: report.environment },
    { title: 'Duration', value: report.duration },
    { title: 'Start', value: report.start },
    { title: 'End', value: report.end },
    { title: 'Triggered by', value: report.actor }
  ];

  const actions: Record<string, unknown>[] = [];
  if (report.runUrl)
    actions.push({ type: 'Action.OpenUrl', title: 'View Run', url: report.runUrl });
  if (report.artifactsUrl) {
    actions.push({ type: 'Action.OpenUrl', title: 'Download Report', url: report.artifactsUrl });
  }

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              size: 'Large',
              weight: 'Bolder',
              color: report.passed ? 'Good' : 'Attention',
              text: headline(report)
            },
            { type: 'FactSet', facts },
            { type: 'TextBlock', wrap: true, text: bodyText(report) }
          ],
          actions
        }
      }
    ]
  };
};

const postWebhook = async (label: string, url: string, payload: unknown): Promise<void> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`${label} replied ${response.status}: ${await response.text()}`);
  }
  console.log(`${label} notification sent.`);
};

/**
 * The bot route rather than a webhook. It needs two values instead of one, but
 * the message can be posted to any channel the bot is in, edited later, and
 * threaded - which is what a team ends up wanting once notifications are used in
 * anger. Slack answers 200 with `ok: false` on failure, so the body has to be
 * checked as well as the status.
 */
const postAsBot = async (token: string, channel: string, payload: unknown): Promise<void> => {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ channel, ...(payload as Record<string, unknown>) })
  });

  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!response.ok || !body.ok) {
    throw new Error(`Slack replied ${response.status}: ${body.error || 'unknown error'}`);
  }
  console.log(`Slack notification sent to ${channel}.`);
};

const { SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, SLACK_WEBHOOK_URL, TEAMS_WEBHOOK_URL } = process.env;

const resolveTargets = (report: Report): Target[] => {
  const targets: Target[] = [];

  // A bot token wins over a webhook when both are set: it is the more capable of
  // the two, and having both configured almost always means the webhook is left
  // over from an earlier setup.
  if (SLACK_BOT_TOKEN && SLACK_CHANNEL_ID) {
    targets.push({
      label: 'Slack (bot)',
      payload: slackPayload(report),
      send: (payload) => postAsBot(SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, payload)
    });
  } else if (SLACK_WEBHOOK_URL) {
    targets.push({
      label: 'Slack (webhook)',
      payload: slackPayload(report),
      send: (payload) => postWebhook('Slack', SLACK_WEBHOOK_URL, payload)
    });
  } else if (SLACK_BOT_TOKEN || SLACK_CHANNEL_ID) {
    console.warn(
      'Slack is half configured: the bot route needs both SLACK_BOT_TOKEN and SLACK_CHANNEL_ID.'
    );
  }

  if (TEAMS_WEBHOOK_URL) {
    targets.push({
      label: 'Teams',
      payload: teamsPayload(report),
      send: (payload) => postWebhook('Teams', TEAMS_WEBHOOK_URL, payload)
    });
  }

  return targets;
};

/**
 * Slack's upload v2 flow: ask for a URL, PUT the bytes, then complete the upload
 * against the channel. The single-request `files.upload` endpoint it replaced is
 * deprecated.
 */
const uploadReport = async (
  token: string,
  channel: string,
  zipPath?: string
): Promise<string | null> => {
  if (!zipPath || !fs.existsSync(zipPath)) return null;

  // Parentheses in a filename make some Slack API versions answer
  // invalid_arguments, so the name is normalised before it is sent.
  const fileName = path.basename(zipPath).replace(/[()\s]/g, '');
  const size = fs.statSync(zipPath).size;

  const urlResponse = await fetch('https://slack.com/api/files.getUploadURLExternal', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ filename: fileName, length: String(size) })
  });

  const urlBody = (await urlResponse.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    upload_url: string;
    file_id: string;
  };
  if (!urlBody.ok) throw new Error(`files.getUploadURLExternal: ${urlBody.error || 'failed'}`);

  const upload = await fetch(urlBody.upload_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: fs.readFileSync(zipPath)
  });
  if (!upload.ok) throw new Error(`uploading the report returned HTTP ${upload.status}`);

  const complete = await fetch('https://slack.com/api/files.completeUploadExternal', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ files: [{ id: urlBody.file_id, title: fileName }], channel_id: channel })
  });

  const completeBody = (await complete.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    files?: { permalink?: string }[];
  };
  if (!completeBody.ok) {
    throw new Error(`files.completeUploadExternal: ${completeBody.error || 'failed'}`);
  }

  const permalink = completeBody.files?.[0]?.permalink || '';
  console.log(`Report uploaded to Slack: ${permalink || fileName}`);
  return permalink;
};

(async () => {
  const report = buildReport();

  if (DRY_RUN) {
    console.log('--- Slack payload ---');
    console.log(JSON.stringify(slackPayload(report), null, 2));
    console.log('--- Teams payload ---');
    console.log(JSON.stringify(teamsPayload(report), null, 2));
    return;
  }

  const targets = resolveTargets(report);

  if (targets.length === 0) {
    console.log(
      'No notification target configured - set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID, ' +
        'or SLACK_WEBHOOK_URL, or TEAMS_WEBHOOK_URL. Skipping.'
    );
    return;
  }

  // Upload first so the message can link to the file that is already there.
  if (SLACK_BOT_TOKEN && SLACK_CHANNEL_ID && process.env.REPORT_ZIP_PATH) {
    try {
      await uploadReport(SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, process.env.REPORT_ZIP_PATH);
    } catch (error) {
      console.warn(`Report upload failed (the message is still sent): ${(error as Error).message}`);
    }
  }

  for (const target of targets) {
    // A broken notification must not change a build result: the outcome is
    // already recorded in the job summary and the artifacts.
    try {
      await target.send(target.payload);
    } catch (error) {
      console.warn(`${target.label} notification failed: ${(error as Error).message}`);
    }
  }
})();
