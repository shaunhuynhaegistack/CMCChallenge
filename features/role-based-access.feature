@rbac
Feature: Role based access
  As a security conscious HR team
  I want each user role to only reach the modules it is entitled to
  So that self service users cannot administer the system

  Background:
    Given I am signed in as "admin"

  @regression
  Scenario: An administrator sees every module
    Then the side menu should contain the modules for the "Admin" role

  @regression @e2e @api
  Scenario: An ESS user cannot reach the administration modules
    Given an employee with an "ESS" account exists
    And the ESS account is listed under Admin - User Management
    When that user signs in from a separate session
    Then the side menu should contain the modules for the "ESS" role
    And the side menu should not contain the modules forbidden for the "ESS" role
    And the admin users API should reject the request with status 403
    And opening the admin page directly should be refused with status 403

  @regression @api @negative
  Scenario: An anonymous caller cannot read employee data
    When an unauthenticated client calls the employees API
    Then the API should reject it with status 401

  @regression @api
  Scenario: An ESS user can read the directory but not change it
    Given an employee with an "ESS" account exists
    When that user signs in from a separate session
    Then that session should be allowed to read the employee list
    But that session should be refused when it tries to create an employee
    And that user should be able to open My Info
