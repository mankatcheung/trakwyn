import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';
import type { Resolved } from '#/graphql/resolved';
import type { ResultOf } from '@graphql-typed-document-node/core';

const APPLICATIONS_QUERY = graphql(`
  query DashboardApplications {
    applications {
      id
      company
      role
      status
      starred
      followUpAt
      createdAt
    }
  }
`);

const CALENDAR_EVENTS_QUERY = graphql(`
  query DashboardCalendarEvents {
    calendarEvents {
      id
      applicationId
      company
      role
      type
      date
      interviewRoundType
    }
  }
`);

const WEEKLY_APPLICATION_GOAL_QUERY = graphql(`
  query WeeklyApplicationGoal {
    weeklyApplicationGoal {
      weeklyApplicationGoal
      currentWeekCount
      currentWeekStart
      streakWeeks
    }
  }
`);

const ONBOARDING_CHECKLIST_QUERY = graphql(`
  query OnboardingChecklist {
    me {
      onboardingChecklistDismissedAt
      onboardingGoals
      aiCredits {
        used
        limit
        bonusRemaining
      }
    }
    apiTokens {
      id
    }
    llmApiKeys {
      provider
    }
    workExperiences {
      id
    }
  }
`);

export const DISMISS_ONBOARDING_CHECKLIST = graphql(`
  mutation DismissOnboardingChecklist {
    dismissOnboardingChecklist
  }
`);

type Application = Resolved<
  NonNullable<ResultOf<typeof APPLICATIONS_QUERY>['applications']>[number],
  'followUpAt'
>;
type CalendarEvent = Resolved<
  NonNullable<ResultOf<typeof CALENDAR_EVENTS_QUERY>['calendarEvents']>[number],
  'interviewRoundType'
>;
type CalendarEventKind = CalendarEvent['type'];
type WeeklyApplicationGoal = Resolved<
  NonNullable<ResultOf<typeof WEEKLY_APPLICATION_GOAL_QUERY>['weeklyApplicationGoal']>
>;
type OnboardingChecklistData = ResultOf<typeof ONBOARDING_CHECKLIST_QUERY>;

export const applicationsQueryOptions = queryOptions({
  queryKey: ['applications'],
  queryFn: async () =>
    (await gqlClient.request(APPLICATIONS_QUERY)) as { applications: Application[] },
});

export const calendarEventsQueryOptions = queryOptions({
  queryKey: ['calendarEvents'],
  queryFn: async () =>
    (await gqlClient.request(CALENDAR_EVENTS_QUERY)) as { calendarEvents: CalendarEvent[] },
});

export const weeklyApplicationGoalQueryOptions = queryOptions({
  queryKey: ['weeklyApplicationGoal'],
  queryFn: async () =>
    (await gqlClient.request(WEEKLY_APPLICATION_GOAL_QUERY)) as {
      weeklyApplicationGoal: WeeklyApplicationGoal;
    },
});

export const onboardingChecklistQueryOptions = queryOptions({
  queryKey: ['onboardingChecklist'],
  queryFn: () => gqlClient.request(ONBOARDING_CHECKLIST_QUERY),
});

export type {
  Application,
  CalendarEventKind,
  CalendarEvent,
  WeeklyApplicationGoal,
  OnboardingChecklistData,
};

/**
 * Starts the dashboard's four queries together. The `/_authenticated` guard
 * calls this without waiting, alongside its gate check; the loader calls it
 * again and gets the same in-flight requests (`query` dedupes in-flight requests).
 */
export function prefetchDashboard(
  queryClient: QueryClient,
  { speculative }: { speculative: boolean },
): Promise<unknown> {
  const started = Promise.all([
    queryClient.query({ ...applicationsQueryOptions, staleTime: 'static' }),
    queryClient.query({ ...calendarEventsQueryOptions, staleTime: 'static' }),
    queryClient.query({ ...weeklyApplicationGoalQueryOptions, staleTime: 'static' }),
    queryClient.query({ ...onboardingChecklistQueryOptions, staleTime: 'static' }),
  ]);
  // A speculative start must never surface as an unhandled rejection: the
  // loader repeats the call and reports the failure.
  if (speculative) started.catch(() => undefined);
  return started;
}
