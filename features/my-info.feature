@myinfo
Feature: My Info
  My Info is the same record the PIM module administers, reached as the signed
  in user rather than as an administrator. That makes it the one screen where a
  user edits their own data, and worth checking that the two routes agree.

  These scenarios read rather than write. The administrator's own record on this
  instance belongs to whoever else is using it, and a suite that edits it to
  prove a point leaves that change behind for everybody.

  Background:
    Given I am signed in as "admin"

  @smoke
  Scenario: My Info opens the signed in user's own record
    When I open My Info
    Then the personal details screen should be shown
    And the record shown should be the signed in user's own

  @regression
  Scenario: My Info offers the sections of a personnel record
    When I open My Info
    Then the record should offer these sections
      | Personal Details   |
      | Contact Details    |
      | Emergency Contacts |
      | Dependents         |
      | Immigration        |
      | Job                |
      | Salary             |
      | Report-to          |
      | Qualifications     |
      | Memberships        |

  @regression @api
  Scenario: My Info and the API describe the same person
    When I open My Info
    Then the name on screen should match the API record for that employee
