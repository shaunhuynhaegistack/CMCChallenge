import { When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { uniqueSuffix } from '../test-data/employee-factory';
import { logVerify, logInfo } from '../lib/logger';
import type { OrangeHrmWorld } from '../support/world';
import type { Candidate } from '../lib/api/ApiClient';

/** A candidate as this suite holds it: the payload plus the id the API assigns. */
type CreatedCandidate = Candidate & { id?: number };

const buildCandidate = (): CreatedCandidate => {
  const suffix = uniqueSuffix();
  return {
    firstName: `Cand${suffix}`,
    middleName: '',
    lastName: `Applicant${suffix.slice(-4)}`,
    email: `cand.${suffix}@example.com`,
    // The API stores the application date as ISO; the list renders it with the
    // instance's own date format, which is why the assertion below reads the
    // name rather than the date string.
    dateOfApplication: new Date().toISOString().slice(0, 10)
  };
};

When('I open the candidate list', async function (this: OrangeHrmWorld) {
  await this.pages.candidates.open(this.baseUrl);
});

When('I create a candidate through the API', async function (this: OrangeHrmWorld) {
  const candidate = buildCandidate();
  const { response, body } = await this.api.createCandidate(candidate);

  expect(response.status()).toBe(200);
  candidate.id = body.data.id;
  this.state.candidate = candidate;
  this.created.candidates.push(candidate.id as number);

  logInfo(`Created candidate #${candidate.id} (${candidate.email}) through the API`);
});

/**
 * Located by the candidate's own unique last name rather than through the name
 * filter. That filter is an autocomplete backed by a search index which does not
 * see a record created seconds ago, so driving it here would be testing the
 * index rather than the list - and would fail for a reason that has nothing to
 * do with the behaviour under test. The list is sorted by application date
 * descending, so a candidate created moments ago is on the first page.
 */
Then('exactly one row should be listed for that candidate', async function (this: OrangeHrmWorld) {
  const { candidate } = this.state;
  const row = this.pages.candidates.rows.filter({ hasText: candidate.lastName });

  await expect(row).toHaveCount(1);
  logVerify(`Candidate list shows "${(await row.innerText()).replace(/\s+/g, ' ').trim()}"`);
});

Then('the API should return the same candidate', async function (this: OrangeHrmWorld) {
  const { candidate } = this.state;
  const { response, body } = await this.api.listCandidates({ limit: 50 });

  expect(response.status()).toBe(200);
  const match = body.data.find((row: { id: number }) => row.id === candidate.id);

  expect(match, `Candidate #${candidate.id} was not in the list the API returned`).toBeTruthy();
  expect(match.firstName).toBe(candidate.firstName);
  expect(match.lastName).toBe(candidate.lastName);
});

When('I try to create a candidate without an email address', async function (this: OrangeHrmWorld) {
  const candidate: Partial<Candidate> = buildCandidate();
  delete candidate.email;

  const { response, body } = await this.api.createCandidate(candidate as Candidate);
  this.state.lastApiResponse = response;
  this.state.lastApiBody = body;
});

Then(
  'the candidate list should offer the filters',
  async function (this: OrangeHrmWorld, table: DataTable) {
    const expected = table.hashes().map((row) => row.filter);
    const offered = await this.pages.candidates.filterLabels();

    logVerify(`The filter panel offers ${JSON.stringify(offered)}`);
    expect(offered).toEqual(expect.arrayContaining(expected));
  }
);
