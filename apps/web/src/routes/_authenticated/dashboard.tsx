import { createFileRoute } from '@tanstack/react-router';
import { queryOptions } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { DashboardPage } from './-components/DashboardPage';

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
  me: { onboardingChecklistDismissedAt: string | null } | null;
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

export const Route = createFileRoute('/_authenticated/dashboard')({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(applicationsQueryOptions),
      queryClient.ensureQueryData(calendarEventsQueryOptions),
      queryClient.ensureQueryData(weeklyApplicationGoalQueryOptions),
      queryClient.ensureQueryData(onboardingChecklistQueryOptions),
    ]),
  component: DashboardPage,
});
