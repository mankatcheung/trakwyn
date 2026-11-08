import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import type { OnboardingGoal } from '#/lib/onboarding';

const APPLICATIONS_QUERY = `
  query Applications {
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
`;

const CALENDAR_EVENTS_QUERY = `
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
`;

const WEEKLY_APPLICATION_GOAL_QUERY = `
  query WeeklyApplicationGoal {
    weeklyApplicationGoal {
      weeklyApplicationGoal
      currentWeekCount
      currentWeekStart
      streakWeeks
    }
  }
`;

const ONBOARDING_CHECKLIST_QUERY = `
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
`;

export const DISMISS_ONBOARDING_CHECKLIST = `
  mutation DismissOnboardingChecklist {
    dismissOnboardingChecklist
  }
`;

type Application = {
  id: string;
  company: string;
  role: string;
  status: string;
  starred: boolean;
  followUpAt?: string | null;
  createdAt: string;
};

type CalendarEventKind = 'applied' | 'followUp' | 'interview';

type CalendarEvent = {
  id: string;
  applicationId: string;
  company: string;
  role: string;
  type: CalendarEventKind;
  date: string;
  interviewRoundType: string | null;
};

export const applicationsQueryOptions = queryOptions({
  queryKey: ['applications'],
  queryFn: () => gqlClient.request<{ applications: Application[] }>(APPLICATIONS_QUERY),
});

export const calendarEventsQueryOptions = queryOptions({
  queryKey: ['calendarEvents'],
  queryFn: () => gqlClient.request<{ calendarEvents: CalendarEvent[] }>(CALENDAR_EVENTS_QUERY),
});

export const weeklyApplicationGoalQueryOptions = queryOptions({
  queryKey: ['weeklyApplicationGoal'],
  queryFn: () =>
    gqlClient.request<{ weeklyApplicationGoal: WeeklyApplicationGoal }>(
      WEEKLY_APPLICATION_GOAL_QUERY,
    ),
});

export const onboardingChecklistQueryOptions = queryOptions({
  queryKey: ['onboardingChecklist'],
  queryFn: () => gqlClient.request<OnboardingChecklistData>(ONBOARDING_CHECKLIST_QUERY),
});

type WeeklyApplicationGoal = {
  weeklyApplicationGoal: number;
  currentWeekCount: number;
  currentWeekStart: string;
  streakWeeks: number;
};

type OnboardingChecklistData = {
  me: {
    onboardingChecklistDismissedAt: string | null;
    onboardingGoals?: OnboardingGoal[];
    aiCredits?: { used: number; limit: number; bonusRemaining: number };
  } | null;
  apiTokens: { id: string }[];
  llmApiKeys: { provider: string }[];
  workExperiences: { id: string }[];
};

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
 * again and gets the same in-flight requests (`ensureQueryData` dedupes).
 */
export function prefetchDashboard(
  queryClient: QueryClient,
  { speculative }: { speculative: boolean },
): Promise<unknown> {
  const started = Promise.all([
    queryClient.ensureQueryData(applicationsQueryOptions),
    queryClient.ensureQueryData(calendarEventsQueryOptions),
    queryClient.ensureQueryData(weeklyApplicationGoalQueryOptions),
    queryClient.ensureQueryData(onboardingChecklistQueryOptions),
  ]);
  // A speculative start must never surface as an unhandled rejection: the
  // loader repeats the call and reports the failure.
  if (speculative) started.catch(() => undefined);
  return started;
}
