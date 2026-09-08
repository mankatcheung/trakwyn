import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  CREATE_INTERVIEW_ROUND_MUTATION,
  DELETE_INTERVIEW_ROUND_MUTATION,
  UPDATE_INTERVIEW_ROUND_MUTATION,
} from '../graphql/operations';
import { interviewRoundsQueryKey } from './useInterviewQueries';
import type { InterviewRound, InterviewRoundFormData } from '../types';

export function useCreateInterviewRound(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InterviewRoundFormData) =>
      gqlRequest<{ createInterviewRound: InterviewRound }>(CREATE_INTERVIEW_ROUND_MUTATION, {
        input: { applicationId, ...data },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: interviewRoundsQueryKey(applicationId) }),
  });
}

export function useUpdateInterviewRound(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: InterviewRoundFormData }) =>
      gqlRequest<{ updateInterviewRound: InterviewRound }>(UPDATE_INTERVIEW_ROUND_MUTATION, {
        id,
        input: data,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: interviewRoundsQueryKey(applicationId) }),
  });
}

export function useDeleteInterviewRound(applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => gqlRequest(DELETE_INTERVIEW_ROUND_MUTATION, { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: interviewRoundsQueryKey(applicationId) }),
  });
}
