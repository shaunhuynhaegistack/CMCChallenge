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
      | user              |
      | invalidPassword   |
      | unknownUser       |
      | wrongCasePassword |
      | injectionAttempt  |
      | overlongUsername  |

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

  @regression @security
  Scenario: The rejection message is the same whether or not the account exists
    When I sign in as "unknownUser"
    And I note the rejection message
    And I am on the OrangeHRM login page
    And I sign in as "invalidPassword"
    Then the rejection message should be identical

  @regression @positive
  Scenario: The user name is not case sensitive
    When I sign in as "lowercaseAdmin"
    Then I should land on the dashboard

  # Observed, not assumed: this product does not trim the user name, so a value
  # pasted from a document with its surrounding whitespace is refused. Pinned
  # here so a future change in either direction is noticed.
  @regression @negative
  Scenario: Surrounding whitespace in the user name is not trimmed
    When I sign in as "paddedAdmin"
    Then I should see the login alert "Invalid credentials"
    And I should stay on the login page

  @regression @security
  Scenario: The session cookie is not readable from script
    When I sign in as "admin"
    Then the session cookie should be flagged HttpOnly

  # The browser will happily redraw the dashboard from its own cache, which
  # proves nothing either way. What matters is whether the session behind it is
  # still good, so the server is asked for that page again.
  @regression @security
  Scenario: The back button does not restore a signed out session
    When I sign in as "admin"
    And I sign out
    And I go back in the browser history
    Then the signed out session cannot open the dashboard again
