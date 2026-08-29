#!/usr/bin/env node
/**
 * Enforces the tagging rules documented in docs/reporting.md.
 *
 * A tagging convention that is only written down erodes within a few sprints, so
 * it is checked in CI alongside the linter:
 *   - every scenario carries exactly one of @smoke or @regression
 *   - every feature carries exactly one functional area tag
 *   - @flaky is reported, because quarantine is meant to be temporary
 */
import fs from 'fs';
import path from 'path';

interface Scenario {
  name: string;
  tags: string[];
}

interface ParsedFeature {
  featureTags: string[];
  scenarios: Scenario[];
}

const FEATURES_DIR = path.join(process.cwd(), 'features');
const AREA_TAGS = [
  '@auth',
  '@pim',
  '@rbac',
  '@dashboard',
  '@recruitment',
  '@leave',
  '@api',
  '@showcase',
  // Changes instance-wide settings, so it is an area of its own that runs alone.
  '@localization'
];
// @demo-failure counts as its own suite: the showcase scenario is deliberately
// outside @smoke and @regression so no normal run can pick it up.
const SUITE_TAGS = ['@smoke', '@regression', '@demo-failure'];

const readTags = (line: string): string[] =>
  line
    .trim()
    .split(/\s+/)
    .filter((token) => token.startsWith('@'));

const parseFeature = (file: string): ParsedFeature => {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const scenarios: Scenario[] = [];
  let featureTags: string[] = [];
  let pending: string[] = [];

  lines.forEach((line: string) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('@')) {
      pending = pending.concat(readTags(trimmed));
      return;
    }

    if (trimmed.startsWith('Feature:')) {
      featureTags = pending;
      pending = [];
      return;
    }

    if (trimmed.startsWith('Scenario:') || trimmed.startsWith('Scenario Outline:')) {
      scenarios.push({ name: trimmed.replace(/^Scenario( Outline)?:\s*/, ''), tags: pending });
      pending = [];
      return;
    }

    // Anything else ends a tag block that was not followed by a Feature or a
    // Scenario, which would silently drop the tags.
    if (trimmed && !trimmed.startsWith('#')) pending = [];
  });

  return { featureTags, scenarios };
};

const problems: string[] = [];
const quarantined: string[] = [];

const featureFiles = fs
  .readdirSync(FEATURES_DIR)
  .filter((file) => file.endsWith('.feature'))
  .map((file) => path.join(FEATURES_DIR, file));

featureFiles.forEach((file: string) => {
  const relative = path.relative(process.cwd(), file);
  const { featureTags, scenarios } = parseFeature(file);

  const areas = featureTags.filter((tag) => AREA_TAGS.includes(tag));
  if (areas.length !== 1) {
    problems.push(
      `${relative}: feature must carry exactly one of ${AREA_TAGS.join(', ')} (found ${areas.join(', ') || 'none'})`
    );
  }

  scenarios.forEach((scenario) => {
    const suite = scenario.tags.filter((tag) => SUITE_TAGS.includes(tag));
    if (suite.length !== 1) {
      problems.push(
        `${relative}: "${scenario.name}" must carry exactly one of @smoke or @regression (found ${suite.join(', ') || 'none'})`
      );
    }
    if (scenario.tags.includes('@flaky')) {
      quarantined.push(`${relative}: "${scenario.name}"`);
    }
  });
});

if (quarantined.length) {
  console.log(`${quarantined.length} scenario(s) are quarantined with @flaky:`);
  quarantined.forEach((entry) => console.log(`  - ${entry}`));
  console.log('');
}

if (problems.length) {
  console.error('Tagging rules violated:');
  problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}

console.log(`Tagging rules satisfied across ${featureFiles.length} feature file(s).`);
