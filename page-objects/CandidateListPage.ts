import type { Locator, Page } from '@playwright/test';
import FilterableListPage from './FilterableListPage';

export class CandidateListPage extends FilterableListPage {
  readonly candidateNameFilter: Locator;

  constructor(page: Page) {
    super(page, {
      path: '/web/index.php/recruitment/viewCandidates',
      listApiPath: '/api/v2/recruitment/candidates'
    });

    this.candidateNameFilter = this.fieldByLabel('Candidate Name');
  }
}

export default CandidateListPage;
