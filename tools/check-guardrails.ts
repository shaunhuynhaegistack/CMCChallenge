#!/usr/bin/env node
/**
 * Deterministic guardrails for the test code itself.
 *
 * These are the rules an experienced reviewer would apply by hand on every pull
 * request, encoded so they are applied on every pull request. They run with no
 * API key and no third party service, which is what makes the merge gate
 * meaningful on its own; the AI review in the same pipeline is the layer on top
 * that catches what a fixed list of rules cannot.
 *
 * Usage:
 *   npm run check:guardrails
 */
import fs from 'fs';
import path from 'path';

const SOURCE_DIRS = ['features', 'step-definitions', 'page-objects', 'lib', 'hooks', 'support'];

/** Source files the rules apply to, now that the framework is TypeScript. */
const isSource = (file: string): boolean => file.endsWith('.ts');

interface Rule {
  id: string;
  description: string;
  appliesTo: (file: string) => boolean;
  pattern: RegExp;
  exempt?: (file: string) => boolean;
}

interface Violation {
  file: string;
  line: number;
  rule: Rule;
  text: string;
}

interface Allowance {
  file: string;
  line: number;
  rule: Rule;
  reason: string;
}

const RULES: Rule[] = [
  {
    id: 'no-fixed-waits',
    description: 'Fixed waits hide a race instead of removing it - wait for a state or a response',
    appliesTo: (file: string) => isSource(file),
    pattern: /\b(waitForTimeout|setTimeout\s*\(\s*resolve)\b/,
    // waits.ts is the one place a delay is legitimate: it is the backoff between
    // polling attempts, not a wait for the application.
    exempt: (file: string) => file.endsWith(path.join('lib', 'utils', 'waits.ts'))
  },
  {
    id: 'no-assertions-in-page-objects',
    description:
      'Page objects expose actions and queries; the step definition decides what is correct',
    appliesTo: (file: string) => file.includes(`page-objects${path.sep}`),
    pattern: /\bexpect\s*\(/
  },
  {
    id: 'no-hardcoded-urls',
    description: 'URLs come from the resolved environment, never from the test code',
    appliesTo: (file: string) =>
      isSource(file) &&
      !file.includes(`config${path.sep}`) &&
      !file.includes(`lib${path.sep}config`),
    pattern: /https?:\/\/(?!localhost)[a-z0-9.-]+\.[a-z]{2,}/i
  },
  {
    id: 'no-focused-scenarios',
    description: 'A focused or skipped scenario silently shrinks the suite',
    appliesTo: (file: string) => file.endsWith('.feature'),
    pattern: /@(only|skip|wip|ignore)\b/
  },
  {
    id: 'no-credentials-in-code',
    description: 'Credentials belong in fixtures or the environment, not in a step definition',
    appliesTo: (file: string) =>
      file.includes(`step-definitions${path.sep}`) || file.includes(`page-objects${path.sep}`),
    pattern: /\b(password|passwd|secret|token|apikey|api_key)\s*[:=]\s*['"][^'"]{3,}['"]/i
  }
];

const walk = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry): string[] => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
};

// Unit tests live beside the code they cover and assert on example URLs and
// fixture values on purpose, so the rules that police production test code do
// not apply to them.
const files = SOURCE_DIRS.flatMap(walk).filter(
  (file) => !file.includes(`${path.sep}unit${path.sep}`)
);
const violations: Violation[] = [];
const allowances: Allowance[] = [];

files.forEach((file: string) => {
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  RULES.forEach((rule) => {
    if (!rule.appliesTo(file)) return;
    if (rule.exempt && rule.exempt(file)) return;

    lines.forEach((line: string, index: number) => {
      // A line that is only a comment is documentation, not behaviour.
      const code = line.trim();
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('#')) return;

      if (!rule.pattern.test(line)) return;

      // A deliberate exception is allowed, but it has to name the rule and give
      // a reason on the line above, so it shows up in review rather than
      // disappearing into a config file.
      const previous = (lines[index - 1] || '').trim();
      const allowed = new RegExp(`guardrail-allow:\\s*${rule.id}\\b`).test(previous);
      if (allowed) {
        allowances.push({
          file,
          line: index + 1,
          rule,
          reason: previous.split('-').slice(-1)[0].trim()
        });
        return;
      }

      violations.push({ file, line: index + 1, rule, text: code.slice(0, 120) });
    });
  });
});

if (allowances.length) {
  console.log(`${allowances.length} documented exception(s):`);
  allowances.forEach((entry) => {
    console.log(`  ${entry.file}:${entry.line}  [${entry.rule.id}] ${entry.reason}`);
  });
  console.log('');
}

if (violations.length === 0) {
  console.log(`Guardrails satisfied across ${files.length} file(s), ${RULES.length} rule(s).`);
  process.exit(0);
}

console.error(`${violations.length} guardrail violation(s):\n`);
violations.forEach((violation) => {
  console.error(`  ${violation.file}:${violation.line}  [${violation.rule.id}]`);
  console.error(`    ${violation.rule.description}`);
  console.error(`    > ${violation.text}\n`);
});
process.exit(1);
