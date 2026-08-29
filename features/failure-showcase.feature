@showcase @demo-failure
Feature: Deliberate failure, for the reports
  This feature is not part of the assignment. It exists so a reviewer can see
  what a failure looks like without waiting for a real one: the HTML report entry,
  the screenshot, the video and the Playwright trace are all produced by the
  scenario below.

  It is excluded from every normal run by the `not @demo-failure` filter in
  cucumber.yaml, and it runs in its own non-blocking CI job, so it
  never turns the pipeline red. `npm run test:failure-demo` runs it locally.

  @demo-failure
  Scenario: A scenario that fails on purpose, so the failure report has content
    Given I am on the OrangeHRM login page
    When I sign in as "admin"
    Then I should see the login alert "This assertion is meant to fail"
