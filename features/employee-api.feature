@pim
Feature: Employee API
  As an integrator
  I want the employee endpoints to behave predictably
  So that anything built on them can be trusted

  Background:
    Given I am signed in as "admin"

  @regression @api
  Scenario: The whole employee lifecycle through the API alone
    When I create an employee through the API
    Then the API should return the same employee record
    When I update the personal details of that employee through the API
    Then the API should return the updated personal details
    When I delete the employee through the API
    Then the API should no longer return the employee

  @regression @negative @api
  Scenario Outline: Creating an employee without <missing> is rejected
    When I try to create an employee without a "<missing>"
    Then the API should reject it with status 422

    Examples:
      | missing   |
      | firstName |
      | lastName  |

  @regression @api
  Scenario: The employee list endpoint paginates
    When I create 3 employees through the API
    And I ask the API for the first 2 of them
    Then it should report a total of 3 and return 2 of them
    And the second page should hold the remaining one, with no overlap
