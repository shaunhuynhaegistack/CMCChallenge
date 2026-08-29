@leave
Feature: Leave
  As an administrator
  I want the leave screens to agree with the leave API
  So that what a user picks from is what the system actually has

  Background:
    Given I am signed in as "admin"

  @smoke
  Scenario: The leave list opens for an administrator
    When I open the leave list
    Then the leave list should offer the filters
      | filter                  |
      | From Date               |
      | To Date                 |
      | Show Leave with Status  |
      | Leave Type              |
      | Employee Name           |

  @regression @api
  Scenario: The leave types offered on screen are the ones the API reports
    When I open the leave list
    Then the leave types in the filter should match the ones the API returns
