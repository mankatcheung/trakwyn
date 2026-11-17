import { queryOptions } from '@tanstack/react-query';
import type { ResultOf } from '@graphql-typed-document-node/core';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';
import type { Resolved } from '#/graphql/resolved';

/** Documents and shapes for an application's interview rounds. */

const INTERVIEW_ROUNDS_QUERY = graphql(`
  query InterviewRounds($applicationId: ID!) {
    interviewRounds(applicationId: $applicationId) {
      id
      applicationId
      type
      scheduledAt
      completedAt
      interviewerName
      notes
      outcome
      questionCount
      mockQuestionCount
      createdAt
      updatedAt
    }
  }
`);

export const CREATE_ROUND = graphql(`
  mutation CreateInterviewRound($input: CreateInterviewRoundInput!) {
    createInterviewRound(input: $input) {
      id
      applicationId
      type
      scheduledAt
      completedAt
      interviewerName
      notes
      outcome
      questionCount
      mockQuestionCount
      createdAt
      updatedAt
    }
  }
`);

export const UPDATE_ROUND = graphql(`
  mutation UpdateInterviewRound($id: ID!, $input: UpdateInterviewRoundInput!) {
    updateInterviewRound(id: $id, input: $input) {
      id
      applicationId
      type
      scheduledAt
      completedAt
      interviewerName
      notes
      outcome
      questionCount
      mockQuestionCount
      createdAt
      updatedAt
    }
  }
`);

export const DELETE_ROUND = graphql(`
  mutation DeleteInterviewRound($id: ID!) {
    deleteInterviewRound(id: $id)
  }
`);

type RoundResult = NonNullable<ResultOf<typeof INTERVIEW_ROUNDS_QUERY>['interviewRounds']>[number];

export type InterviewRound = Resolved<
  RoundResult,
  'scheduledAt' | 'completedAt' | 'interviewerName' | 'notes'
>;

export type InterviewRoundsData = { interviewRounds: InterviewRound[] };

export const interviewRoundsQueryKey = (applicationId: string) =>
  ['interviewRounds', applicationId] as const;

export const interviewRoundsQueryOptions = (applicationId: string) =>
  queryOptions({
    queryKey: interviewRoundsQueryKey(applicationId),
    queryFn: async () =>
      (await gqlClient.request(INTERVIEW_ROUNDS_QUERY, { applicationId })) as InterviewRoundsData,
  });
