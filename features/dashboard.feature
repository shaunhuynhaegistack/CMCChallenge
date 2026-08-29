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
  # Named for what it checks. Reachability across *every* module the instance
  # ships is features/module-navigation.feature; this is the subset the brief
  # names, asserted from the dashboard the user lands on.
  Scenario: The modules the brief names open from the side menu
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
