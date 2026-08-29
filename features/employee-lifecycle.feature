@pim
Feature: Employee lifecycle
  As an HR administrator
  I want to create, update and remove an employee
  So that the workforce records stay accurate

  Every scenario cleans up after itself: whatever the scenario created is deleted
  through the API in the After hook, even when the scenario fails part way.

  Background:
    Given I am signed in as "admin"

  @smoke @e2e @api
  Scenario: Full lifecycle of an employee, verified through the UI and the API
    When I create a new employee through the PIM module
    Then the employee should be saved and opened on the personal details screen
    And the API should return the same employee record
    When I update the personal details of the employee
    Then the update should be confirmed on screen
    And the API should return the updated personal details
    When I delete the employee from the employee list
    Then the employee should no longer be listed
    And the API should no longer return the employee

  @regression @negative
  Scenario: Mandatory fields are enforced when adding an employee
    When I open the add employee screen
    And I save the employee form without filling it in
    Then the first and last name fields should be flagged as required

  @regression @api
  Scenario: An employee created through the API is visible in the UI
    When I create an employee through the API
    And I search for that employee in the employee list
    Then exactly one employee row should be listed
    And the listed row should show the employee id and name

  @regression @api
  Scenario: Personal details changed through the API are shown in the UI
    When I create an employee through the API
    And I update the personal details of that employee through the API
    Then the personal details screen should show the updated values
    And the date of birth should be shown in the instance date format

  @regression
  Scenario: The employee list can be filtered by employee name
    When I create an employee through the API
    And I search for that employee by name in the employee list
    Then exactly one employee row should be listed
    And the listed row should show the employee id and name

  @regression @negative @api
  Scenario: An employee id that is already in use is rejected
    When I create an employee through the API
    And I try to create another employee with the same employee id
    Then the API should reject it with status 422
    And the rejection should name "employeeId" as the invalid parameter

  @regression
  Scenario: Resetting the filter brings the full employee list back
    When I create an employee through the API
    And I search for that employee in the employee list
    Then exactly one employee row should be listed
    When I reset the employee list filter
    Then more than one employee row should be listed

  @regression @api
  Scenario: The record count on screen matches the API for the same filter
    When I create an employee through the API
    And I search for that employee by name in the employee list
    Then the record count on screen should match the total the API reports for that filter

  @regression
  Scenario: Several employees can be removed in one bulk delete
    When I create 2 employees through the API
    And I search for those employees by their shared name prefix
    And I delete all the listed employees in one action
    Then no employee rows should be listed
    And the API should no longer return any of them

  @regression @api
  Scenario: Contact details saved in the UI are returned by the API
    When I create an employee through the API
    And I save contact details for that employee in the UI
    Then the API should return the same contact details
