@auth
Feature: Authentication
  As an OrangeHRM user
  I want the login screen to accept only valid credentials
  So that employee data stays protected

  Background:
    Given I am on the OrangeHRM login page

  @smoke @positive
  Scenario: An administrator signs in successfully
    When I sign in as "admin"
    Then I should land on the dashboard
    And the top bar should show the logged in user

  @regression @negative
  Scenario Outline: Sign in is rejected for <user>
    When I sign in as "<user>"
    Then I should see the login alert "Invalid credentials"
    And I should stay on the login page

    Examples:
      | user            |
      | invalidPassword |
      | unknownUser     |

  @regression @negative
  Scenario: Submitting an empty form shows field level validation
    When I sign in as "emptyCredentials"
    Then both credential fields should be flagged as required
    And I should stay on the login page

  @smoke @positive
  Scenario: Signing out returns the user to the login page
    When I sign in as "admin"
    And I sign out
    Then I should stay on the login page

  @regression @negative
  Scenario: The session is invalidated after signing out
    When I sign in as "admin"
    And I sign out
    And I open the employee list URL directly
    Then I should stay on the login page

  @regression @positive
  Scenario: The login page presents the branding and hides what is typed as a password
    Then the page should be titled "OrangeHRM"
    And the login branding should be visible
    And the password field should hide what is typed into it

  @regression @negative
  Scenario: The password reset page is reachable from the login page
    When I follow the forgotten password link
    Then I should be taken to the password reset page

  @regression @negative
  Scenario: Signing in without a password is rejected before the request is sent
    When I sign in as "missingPassword"
    Then only the password field should be flagged as required
    And I should stay on the login page
