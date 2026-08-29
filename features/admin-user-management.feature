@admin
Feature: Administering system users
  Admin - User Management is where accounts are created, found and removed. It
  is the module with the most direct security consequence in the product, and
  the one where a filter that quietly ignores its input is most expensive.

  Every account these scenarios create is deleted again by the After hook, even
  when the scenario fails, because the instance is shared.

  Background:
    Given I am signed in as "admin"
    And I open the system users screen

  @smoke
  Scenario: The user list opens with its filters and its records
    Then the user list should offer the filters
      | Username  |
      | User Role |
      | Employee Name |
      | Status    |
    And the user list should report how many records it found

  @regression @api
  Scenario: An account created through the API is found by its user name
    Given an employee with an "ESS" account exists
    When I search the user list for that account
    Then exactly one account should be listed
    And the listed account should be the one that was created

  @regression
  Scenario: A user name that does not exist returns nothing rather than everything
    When I search the user list for a user name that does not exist
    Then no accounts should be listed

  @regression
  Scenario: Resetting the filter brings the full list back
    Given an employee with an "ESS" account exists
    And I search the user list for that account
    When I reset the user list filter
    Then more accounts should be listed than the filter returned

  @regression @api
  Scenario: A duplicate user name is rejected
    Given an employee with an "ESS" account exists
    When I try to create a second account with the same user name
    Then the API should reject it as a duplicate

  @regression @api
  Scenario: An account deleted through the UI is gone from the API
    Given an employee with an "ESS" account exists
    When I search the user list for that account
    And I delete the first account in the list
    Then the deletion should be confirmed
    And the API should no longer return that account
