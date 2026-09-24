import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  DASHBOARD_CALENDAR_EVENTS_QUERY,
  DISMISS_ONBOARDING_CHECKLIST_MUTATION,
  ONBOARDING_CHECKLIST_QUERY,
  WEEKLY_APPLICATION_GOAL_QUERY,
} from '../graphql/operations';
import type { CalendarEvent, OnboardingChecklistData, WeeklyApplicationGoal } from '../types';

export const onboardingChecklistQueryKey = ['onboardingChecklist'] as const;

export function useDashboardCalendarEvents() {
  return useQuery({
    queryKey: ['calendarEvents'],
    queryFn: () =>
      gqlRequest<{ calendarEvents: CalendarEvent[] }>(DASHBOARD_CALENDAR_EVENTS_QUERY).then(
        (data) => data.calendarEvents,
      ),
  });
}

export function useWeeklyApplicationGoal() {
  return useQuery({
    queryKey: ['weeklyApplicationGoal'],
    queryFn: () =>
      gqlRequest<{ weeklyApplicationGoal: WeeklyApplicationGoal }>(
        WEEKLY_APPLICATION_GOAL_QUERY,
      ).then((data) => data.weeklyApplicationGoal),
  });
}

export function useOnboardingChecklist() {
  return useQuery({
    queryKey: onboardingChecklistQueryKey,
    queryFn: () => gqlRequest<OnboardingChecklistData>(ONBOARDING_CHECKLIST_QUERY),
  });
}

export function useDismissOnboardingChecklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      gqlRequest<{ dismissOnboardingChecklist: boolean }>(DISMISS_ONBOARDING_CHECKLIST_MUTATION),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: onboardingChecklistQueryKey }),
  });
}
