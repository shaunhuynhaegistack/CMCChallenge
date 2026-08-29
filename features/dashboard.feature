@dashboard
Feature: Dashboard
  As a signed in user
  I want the dashboard to load and the navigation to work
  So that I can reach the modules my role allows

  Background:
    Given I am signed in as "admin"

  @smoke
  Scenario: The dashboard presents its widgets
    Then the dashboard should show at least 3 widgets
    And the widgets should include "Quick Launch"

  @regression
  Scenario: Every module an administrator can see opens its own screen
    Then each of these modules should open from the side menu
      | module      | lands on     |
      | Admin       | /admin/      |
      | PIM         | /pim/        |
      | Leave       | /leave/      |
      | Time        | /time/       |
      | Recruitment | /recruitment |
      | My Info     | /pim/        |
      | Performance | /performance |
      | Directory   | /directory   |
      | Maintenance | /maintenance |
