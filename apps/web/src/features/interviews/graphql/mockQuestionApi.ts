import { queryOptions } from '@tanstack/react-query';
import type { ResultOf } from '@graphql-typed-document-node/core';
import { gqlClient } from '#/graphql/client';
import { graphql } from '#/graphql/generated';
import type { Resolved } from '#/graphql/resolved';

/** Documents and shapes for an interview round's practice (mock) questions (JEF-393). */

const MOCK_QUESTIONS_QUERY = graphql(`
  query MockInterviewQuestions($interviewRoundId: ID!) {
    mockInterviewQuestions(interviewRoundId: $interviewRoundId) {
      id
      interviewRoundId
      question
      answer
      answerSource
      talkingPoints
      talkingPointsGeneratedAt
      position
      createdAt
      updatedAt
    }
  }
`);

export const CREATE_MOCK_QUESTION = graphql(`
  mutation CreateMockInterviewQuestion($input: CreateMockInterviewQuestionInput!) {
    createMockInterviewQuestion(input: $input) {
      id
      interviewRoundId
      question
      answer
      answerSource
      talkingPoints
      talkingPointsGeneratedAt
      position
      createdAt
      updatedAt
    }
  }
`);

export const UPDATE_MOCK_QUESTION = graphql(`
  mutation UpdateMockInterviewQuestion($id: ID!, $input: UpdateMockInterviewQuestionInput!) {
    updateMockInterviewQuestion(id: $id, input: $input) {
      id
      interviewRoundId
      question
      answer
      answerSource
      talkingPoints
      talkingPointsGeneratedAt
      position
      createdAt
      updatedAt
    }
  }
`);

export const DELETE_MOCK_QUESTION = graphql(`
  mutation DeleteMockInterviewQuestion($id: ID!) {
    deleteMockInterviewQuestion(id: $id)
  }
`);

export const REORDER_MOCK_QUESTIONS = graphql(`
  mutation ReorderMockInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {
    reorderMockInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) {
      id
      interviewRoundId
      question
      answer
      answerSource
      talkingPoints
      talkingPointsGeneratedAt
      position
      createdAt
      updatedAt
    }
  }
`);

export const GENERATE_MOCK_QUESTIONS = graphql(`
  mutation GenerateMockInterviewQuestions(
    $interviewRoundId: ID!
    $prompt: String
    $count: Int
    $useProfile: Boolean
    $documentId: ID
  ) {
    generateMockInterviewQuestions(
      interviewRoundId: $interviewRoundId
      prompt: $prompt
      count: $count
      useProfile: $useProfile
      documentId: $documentId
    ) {
      suggestions
      usedJobDescription
      usedBriefing
      usedProfile
      usedDocument
    }
  }
`);

export const GENERATE_MOCK_ANSWER = graphql(`
  mutation GenerateMockInterviewAnswer(
    $mockInterviewQuestionId: ID!
    $prompt: String
    $useProfile: Boolean
    $documentId: ID
  ) {
    generateMockInterviewAnswer(
      mockInterviewQuestionId: $mockInterviewQuestionId
      prompt: $prompt
      useProfile: $useProfile
      documentId: $documentId
    ) {
      answer
      usedJobDescription
      usedBriefing
      usedProfile
      usedDocument
    }
  }
`);

export const GENERATE_MOCK_TALKING_POINTS = graphql(`
  mutation GenerateMockTalkingPoints(
    $mockInterviewQuestionId: ID!
    $prompt: String
    $useProfile: Boolean
    $documentId: ID
  ) {
    generateMockTalkingPoints(
      mockInterviewQuestionId: $mockInterviewQuestionId
      prompt: $prompt
      useProfile: $useProfile
      documentId: $documentId
    ) {
      nothingRelevant
      usedProfile
      usedDocument
      question {
        id
        interviewRoundId
        question
        answer
        answerSource
        talkingPoints
        talkingPointsGeneratedAt
        position
        createdAt
        updatedAt
      }
    }
  }
`);

type MockQuestionResult = NonNullable<
  ResultOf<typeof MOCK_QUESTIONS_QUERY>['mockInterviewQuestions']
>[number];

/** `talkingPoints` are AI generated bullets, one per line, each citing the experience it came from (JEF-394). */
export type MockQuestion = Resolved<
  MockQuestionResult,
  'answer' | 'talkingPoints' | 'talkingPointsGeneratedAt'
>;

export type MockQuestionsData = { mockInterviewQuestions: MockQuestion[] };

export type GeneratedQuestions = Resolved<
  NonNullable<ResultOf<typeof GENERATE_MOCK_QUESTIONS>['generateMockInterviewQuestions']>
>;

export type GeneratedAnswer = Resolved<
  NonNullable<ResultOf<typeof GENERATE_MOCK_ANSWER>['generateMockInterviewAnswer']>
>;

/** `nothingRelevant`: the background held nothing relevant, so nothing was saved. */
export type GeneratedTalkingPoints = Omit<
  Resolved<NonNullable<ResultOf<typeof GENERATE_MOCK_TALKING_POINTS>['generateMockTalkingPoints']>>,
  'question'
> & { question: MockQuestion };

export const mockQuestionsQueryKey = (roundId: string) =>
  ['mockInterviewQuestions', roundId] as const;

export const mockQuestionsQueryOptions = (roundId: string) =>
  queryOptions({
    queryKey: mockQuestionsQueryKey(roundId),
    queryFn: async () =>
      (await gqlClient.request(MOCK_QUESTIONS_QUERY, {
        interviewRoundId: roundId,
      })) as MockQuestionsData,
  });
