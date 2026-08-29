@auth @password-reset
Feature: Requesting a password reset
  A user who cannot sign in has one way back in, and that screen deserves the
  same care as the login form: it is unauthenticated, it takes a username, and
  what it says back is a security decision rather than a cosmetic one.

  These scenarios deliberately stop short of submitting a reset. The demo
  instance throttles the request - after a handful of submissions the form stops
  answering and simply stays where it is - so a scenario that depends on one
  being accepted is unstable for a reason that has nothing to do with this code.
  The property that submission would have proved, that the response does not
  reveal whether an account exists, is asserted on the login form instead, where
  the same information leak would matter and where the screen answers every time.

  Background:
    Given I am on the password reset page

  @smoke @positive
  Scenario: The reset screen offers a username, a submit and a way back
    Then the reset screen should be titled "Reset Password"
    And the reset screen should offer a "Username" field
    And the reset screen should offer the buttons "Cancel" and "Reset Password"

  @regression @negative
  Scenario: A reset cannot be requested without a username
    When I submit the reset form without a username
    Then the username field should be flagged as required
    And I should stay on the password reset page

  @regression @positive
  Scenario: Cancelling returns to the login page
    When I cancel the password reset
    Then I should be back on the login page

  @regression @positive
  Scenario: The reset screen is reachable from the login page and back again
    When I go to the login page
    And I follow the forgotten password link
    Then I should be taken to the password reset page
    When I cancel the password reset
    Then I should be back on the login page
