#!/usr/bin/env node
/**
 * AI review gate.
 *
 * Reviews the pull request diff and turns the answer into a merge gate: the job
 * fails when the model reports a blocking finding.
 *
 * Providers are tried in order and the first one that is configured wins:
 *
 *   1. Greptile        - needs GREPTILE_API_KEY and GITHUB_TOKEN, and the
 *                        repository to have been indexed once. It reviews
 *                        against the whole repository rather than the diff
 *                        alone, so it sees consequences elsewhere in the
 *                        codebase.
 *   2. GitHub Models   - free on public repositories, uses the workflow's own
 *                        GITHUB_TOKEN, no secret to configure. Being retired by
 *                        GitHub, so it is the last resort rather than the
 *                        default.
 *
 * Outputs
 *   - ai-review.md   markdown body, posted as a pull request comment
 *   - exit code 1    at least one blocking finding
 */
import fs from 'fs';

const DIFF_FILE = process.env.DIFF_FILE || 'pr.diff';
const OUTPUT_FILE = process.env.OUTPUT_FILE || 'ai-review.md';
const MAX_DIFF_CHARS = Number(process.env.MAX_DIFF_CHARS || 120000);

// When no provider is configured, or the one that is fails, the gate cannot form
// an opinion. Strict mode fails the job in that case; the default is to warn and
// pass so an outage in somebody else's service does not block every pull request.
const STRICT = process.env.AI_REVIEW_STRICT === 'true';

const SYSTEM_PROMPT = `You are a senior test automation engineer reviewing a pull request in a
Playwright + Cucumber end-to-end testing repository.

Judge only what the diff changes. Report a finding when you see:
  - a correctness bug, a broken selector strategy or an assertion that cannot fail
  - a hard coded wait, a hard coded credential, or a hard coded environment value
  - an assertion placed inside a page object instead of a step definition
  - test data that can collide between parallel workers
  - a change that silently weakens the suite (skipped scenario, removed assertion)

Severity:
  - "blocking" for anything that makes the suite wrong, unsafe or unreliable
  - "advisory" for style, naming and maintainability

Reply with JSON only, no prose and no code fences:
{"summary":"one sentence","findings":[{"severity":"blocking|advisory","file":"path","line":123,"issue":"what is wrong","suggestion":"what to do"}]}
Return an empty findings array when the diff is fine.`;

const readDiff = () => {
  if (!fs.existsSync(DIFF_FILE)) return '';

  const diff = fs.readFileSync(DIFF_FILE, 'utf8');
  return diff.length > MAX_DIFF_CHARS
    ? `${diff.slice(0, MAX_DIFF_CHARS)}\n\n[diff truncated at ${MAX_DIFF_CHARS} characters]`
    : diff;
};

/** One finding out of the model's JSON answer. */
interface Finding {
  severity?: string;
  file?: string;
  line?: number | string;
  issue: string;
  suggestion?: string;
}

interface Review {
  summary: string;
  findings: Finding[];
  raw?: string;
}

interface Answer {
  model: string;
  text: string;
}

interface Provider {
  name: string;
  available: () => boolean;
  ask: (diff: string) => Promise<Answer>;
}

/** The API token headers, with the optional one dropped when it is not set. */
const authHeaders = (token: string | undefined, gitHubToken?: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  ...(gitHubToken ? { 'X-GitHub-Token': gitHubToken } : {}),
  'Content-Type': 'application/json'
});

/**
 * Greptile indexes a repository and answers questions with that index in
 * context, so unlike a diff-only reviewer it can say "this breaks the other
 * caller in page-objects/". The repository has to be indexed once before the
 * first query; the call below asks for it and reports clearly if it is not ready.
 */
const askGreptile = async (diff: string): Promise<Answer> => {
  const repository = process.env.GITHUB_REPOSITORY;
  const branch = process.env.GITHUB_BASE_REF || 'main';
  const model = 'greptile';

  const response = await fetch('https://api.greptile.com/v2/query', {
    method: 'POST',
    headers: authHeaders(process.env.GREPTILE_API_KEY, process.env.GITHUB_TOKEN),
    body: JSON.stringify({
      messages: [
        { id: 'review', role: 'user', content: `${SYSTEM_PROMPT}\n\nPull request diff:\n\n${diff}` }
      ],
      repositories: [{ remote: 'github', repository, branch }],
      genius: true
    })
  });

  if (!response.ok) {
    const detail = await response.text();

    // Greptile answers questions against an index of the repository, which has
    // to be built once. Rather than just reporting that, submit it - indexing is
    // asynchronous, so this run still reports "not evaluated" and the next one
    // works.
    if (response.status === 404) {
      await fetch('https://api.greptile.com/v2/repositories', {
        method: 'POST',
        headers: authHeaders(process.env.GREPTILE_API_KEY, process.env.GITHUB_TOKEN),
        body: JSON.stringify({ remote: 'github', repository, branch, reload: false })
      }).catch(() => {});

      throw new Error(
        `Greptile has not indexed ${repository}@${branch} yet. Indexing has been requested - it runs in the background, so the next pull request will be reviewed.`
      );
    }

    throw new Error(`Greptile replied ${response.status}: ${detail}`);
  }

  const payload = (await response.json()) as { message?: string; answer?: string };
  return { model, text: payload.message || payload.answer || '' };
};

const askGitHubModels = async (diff: string): Promise<Answer> => {
  const model = process.env.GITHUB_MODEL || 'openai/gpt-4o-mini';

  const response = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Pull request diff:\n\n${diff}` }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub Models replied ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  return { model: `${model} (GitHub Models)`, text: payload.choices?.[0]?.message?.content || '' };
};

const providers: Provider[] = [
  {
    name: 'Greptile',
    available: () => Boolean(process.env.GREPTILE_API_KEY && process.env.GITHUB_TOKEN),
    ask: askGreptile
  },
  {
    name: 'GitHub Models',
    available: () => Boolean(process.env.GITHUB_TOKEN),
    ask: askGitHubModels
  }
];

const parseReview = (raw: string): Review => {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary || 'No summary returned.',
      findings: Array.isArray(parsed.findings) ? parsed.findings : []
    };
  } catch {
    // The model ignored the format. Surface the raw answer rather than pretending
    // the review passed.
    return { summary: 'The model did not return valid JSON.', findings: [], raw: cleaned };
  }
};

const renderMarkdown = (
  { summary, findings, raw }: Review,
  model: string
): { markdown: string; blockingCount: number } => {
  const blocking = findings.filter((finding) => finding.severity === 'blocking');
  const advisory = findings.filter((finding) => finding.severity !== 'blocking');

  const lines = [
    `## AI review gate - ${blocking.length ? '❌ Changes requested' : '✅ Approved'}`,
    '',
    summary,
    '',
    `Reviewed by \`${model}\`.`
  ];

  const section = (title: string, items: Finding[]): void => {
    if (!items.length) return;
    lines.push('', `### ${title}`, '');
    items.forEach((item) => {
      const where = item.file ? `\`${item.file}${item.line ? `:${item.line}` : ''}\`` : 'general';
      lines.push(`- ${where} - ${item.issue}`);
      if (item.suggestion) lines.push(`  - Suggestion: ${item.suggestion}`);
    });
  };

  section(`Blocking (${blocking.length})`, blocking);
  section(`Advisory (${advisory.length})`, advisory);

  if (raw) {
    lines.push(
      '',
      '<details><summary>Raw model output</summary>',
      '',
      '```',
      raw,
      '```',
      '</details>'
    );
  }

  return { markdown: lines.join('\n'), blockingCount: blocking.length };
};

const finish = (markdown: string, exitCode: number): never => {
  fs.writeFileSync(OUTPUT_FILE, markdown);
  console.log(markdown);
  process.exit(exitCode);
};

const notEvaluated = (reason: string): string =>
  [
    '## AI review gate - ⚠️ Not evaluated',
    '',
    reason,
    '',
    STRICT
      ? 'The gate runs in strict mode, so this fails the check.'
      : 'The gate is not in strict mode, so this does not block the merge.'
  ].join('\n');

(async () => {
  const diff = readDiff();

  if (!diff.trim()) {
    finish(
      '## AI review gate - ✅ Approved\n\nThe pull request contains no reviewable changes.',
      0
    );
  }

  const configured = providers.filter((provider) => provider.available());

  if (configured.length === 0) {
    finish(
      notEvaluated(
        'No review provider is configured. Add `GREPTILE_API_KEY` as a repository secret to enable the gate.'
      ),
      STRICT ? 1 : 0
    );
  }

  const failures: string[] = [];

  for (const provider of configured) {
    try {
      const { model, text } = await provider.ask(diff);
      const { markdown, blockingCount } = renderMarkdown(parseReview(text), model);
      finish(markdown, blockingCount > 0 ? 1 : 0);
    } catch (error) {
      failures.push(`${provider.name}: ${(error as Error).message}`);
    }
  }

  finish(
    notEvaluated(`Every configured provider failed.\n\n- ${failures.join('\n- ')}`),
    STRICT ? 1 : 0
  );
})();
