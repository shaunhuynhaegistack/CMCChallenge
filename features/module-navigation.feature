@navigation
Feature: Every module an administrator can reach
  The assignment names five modules. This instance ships twelve, and a suite
  that only ever visits five cannot say whether the others are reachable at all
  - which is the first thing that breaks when a deployment goes wrong.

  These are read-only on purpose. The modules the suite owns data in are covered
  in depth by their own features; the rest are checked for the one property that
  matters here and can be asserted without touching anybody else's records: the
  route resolves, the application renders it, and the server does not answer with
  an error.

  Maintenance deserves a note. Its menu entry lands straight on Purge Records,
  which permanently deletes employee data on an instance other people are using.
  It gets a scenario of its own rather than a row in the table below, because it
  does not render the module chrome the others do - it renders a second
  credentials prompt, which is the more interesting thing to assert. The suite
  goes as far as that prompt and deliberately does not answer it.

  Background:
    Given I am signed in as "admin"

  @smoke
  Scenario Outline: The <module> module is reachable and renders
    When I open the "<module>" module from the side menu
    Then the browser should be on "<route>"
    And the module should render its own heading

    Examples:
      | module      | route                                |
      | Admin       | /admin/viewSystemUsers               |
      | PIM         | /pim/viewEmployeeList                |
      | Leave       | /leave/viewLeaveList                 |
      | Time        | /time/viewEmployeeTimesheet          |
      | Recruitment | /recruitment/viewCandidates          |
      | Performance | /performance/searchEvaluatePerforman |
      | Directory   | /directory/viewDirectory             |
      | Claim       | /claim/viewAssignClaim               |
      | Buzz        | /buzz/viewBuzz                       |

  @regression @security
  Scenario: Maintenance asks for the administrator password again
    When I open the "Maintenance" module from the side menu
    Then the browser should be on "/maintenance/purgeEmployee"
    And the screen should ask for the administrator credentials again

  @regression
  Scenario: The side menu offers every module this role is entitled to
    Then the side menu should offer these modules
      | Admin       |
      | PIM         |
      | Leave       |
      | Time        |
      | Recruitment |
      | My Info     |
      | Performance |
      | Dashboard   |
      | Directory   |
      | Maintenance |
      | Claim       |
      | Buzz        |

  @regression
  Scenario: A module route answers with a page rather than an error
    When I request each module route directly
    Then every module route should answer with a success status
