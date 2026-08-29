@recruitment
Feature: Recruitment
  As a hiring administrator
  I want candidates to be created and found reliably
  So that an application is never lost between the API and the screen

  Background:
    Given I am signed in as "admin"

  @smoke
  Scenario: The candidate list opens with its filters
    When I open the candidate list
    Then the candidate list should offer the filters
      | filter          |
      | Job Title       |
      | Vacancy         |
      | Hiring Manager  |
      | Status          |
      | Candidate Name  |

  @regression @api
  Scenario: A candidate created through the API appears in the candidate list
    When I create a candidate through the API
    And I open the candidate list
    Then exactly one row should be listed for that candidate
    And the API should return the same candidate

  @regression @negative @api
  Scenario: A candidate without an email address is rejected
    When I try to create a candidate without an email address
    Then the API should reject it with status 422
    And the rejection should name "email" as the invalid parameter
