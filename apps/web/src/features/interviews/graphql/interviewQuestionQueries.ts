import { queryOptions } from '@tanstack/react-query';
import type { ResultOf } from '@graphql-typed-document-node/core';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';
import type { Resolved } from '#/graphql/resolved';

/** Documents and shapes for the questions asked in an interview round. */

const INTERVIEW_QUESTIONS_QUERY = graphql(`
  query InterviewQuestions($interviewRoundId: ID!) {
    interviewQuestions(interviewRoundId: $interviewRoundId) {
      id
      interviewRoundId
      question
      answer
      position
      createdAt
      updatedAt
    }
  }
`);

export const CREATE_QUESTION = graphql(`
  mutation CreateInterviewQuestion($input: CreateInterviewQuestionInput!) {
    createInterviewQuestion(input: $input) {
      id
      interviewRoundId
      question
      answer
      position
      createdAt
      updatedAt
    }
  }
`);

export const UPDATE_QUESTION = graphql(`
  mutation UpdateInterviewQuestion($id: ID!, $input: UpdateInterviewQuestionInput!) {
    updateInterviewQuestion(id: $id, input: $input) {
      id
      interviewRoundId
      question
      answer
      position
      createdAt
      updatedAt
    }
  }
`);

export const DELETE_QUESTION = graphql(`
  mutation DeleteInterviewQuestion($id: ID!) {
    deleteInterviewQuestion(id: $id)
  }
`);

export const REORDER_QUESTIONS = graphql(`
  mutation ReorderInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {
    reorderInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) {
      id
      interviewRoundId
      question
      answer
      position
      createdAt
      updatedAt
    }
  }
`);

type QuestionResult = NonNullable<
  ResultOf<typeof INTERVIEW_QUESTIONS_QUERY>['interviewQuestions']
>[number];

export type InterviewQuestion = Resolved<QuestionResult, 'answer'>;

export type InterviewQuestionsData = { interviewQuestions: InterviewQuestion[] };

export const interviewQuestionsQueryKey = (roundId: string) =>
  ['interviewQuestions', roundId] as const;

export const interviewQuestionsQueryOptions = (roundId: string) =>
  queryOptions({
    queryKey: interviewQuestionsQueryKey(roundId),
    queryFn: async () =>
      (await gqlClient.request(INTERVIEW_QUESTIONS_QUERY, {
        interviewRoundId: roundId,
      })) as InterviewQuestionsData,
  });
