@localization
Feature: Localization is instance-wide, and the suite must not assume it
  The display language and the date format are settings under Admin >
  Configuration > Localization. They apply to the whole instance, not to a
  session, so on a shared target they are somebody else's mutable state.

  Both were observed changing on this instance inside one evening, and each
  breaks a suite in a way that reads like a code defect: the language decides
  the label on every control, and the date format decides how a stored date is
  rendered.

  These scenarios change those settings on purpose, so they cannot run beside
  anything else - they carry their own tag and their own profile, at one worker.
  Each one puts the setting back, whether it passed or failed.

  Background:
    Given I am signed in as "admin"
    And the instance localization is recorded so it can be restored

  @smoke @language
  Scenario: The language decides the label on every control
    When the instance language is set to "es"
    Then the sign-in button should read "Ingresar"
    When the instance language is set to "en_US"
    Then the sign-in button should read "Login"

  @regression @language @api
  Scenario: Changing the language does not change what the API returns
    Given an employee created through the API
    When the instance language is set to "es"
    Then the API should still return that employee unchanged

  @regression @date
  Scenario Outline: A stored date is rendered in the instance date format
    Given an employee created through the API
    And that employee has a date of birth of "1992-04-18"
    When the instance date format is set to "<format>"
    Then the personal details screen should show the date of birth as "<rendered>"

    Examples:
      | format | rendered   |
      | Y-m-d  | 1992-04-18 |
      | d-m-Y  | 18-04-1992 |
      | m-d-Y  | 04-18-1992 |

  @regression @date @api
  Scenario: The date format is presentation only - the API still stores ISO
    Given an employee created through the API
    And that employee has a date of birth of "1992-04-18"
    When the instance date format is set to "d-m-Y"
    Then the API should still report the date of birth as "1992-04-18"
