import { graphql } from '#/graphql/generated';

export const SHARED_SUMMARY_QUERY = graphql(`
  query SharedSummary($token: String!) {
    sharedSummary(token: $token) {
      statusCounts {
        status
        count
      }
      totalApplications
      totalInterviews
      upcomingInterviews
      applicationsUpdatedLast7Days
      generatedAt
    }
  }
`);
