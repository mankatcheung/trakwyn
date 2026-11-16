import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));
jest.mock('../../../ai/hooks/useRefreshAiCredits', () => ({
  useRefreshAiCredits: () => jest.fn(),
}));

import { gqlRequest } from '../../../../graphql/client';
import {
  resumeGapsQueryKey,
  useAddGapMetric,
  useAddGapSkill,
  useDismissResumeGap,
  useResumeGaps,
} from '../useResumeGaps';
import {
  postingRequirementsQueryKey,
  useExtractPostingRequirements,
  usePostingRequirements,
} from '../usePostingRequirements';
import type { PostingRequirements, ResumeGaps } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const gaps: ResumeGaps = {
  requirementsRead: true,
  requirementGaps: ['Kubernetes'],
  rolesWithoutMetrics: [],
};

const requirements: PostingRequirements = {
  id: 'r1',
  applicationId: 'app-1',
  mustHave: ['TypeScript'],
  niceToHave: [],
  keywords: ['React'],
  seniority: 'Senior',
  generatedAt: '2026-11-01T00:00:00.000Z',
  isStale: false,
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, invalidate, wrapper };
}

describe('useResumeGaps', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the gap questions of an application', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ resumeGaps: gaps });
    const { wrapper } = setup();

    const { result } = await renderHook(() => useResumeGaps('app-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(gaps);
    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining('resumeGaps'), {
      applicationId: 'app-1',
    });
  });

  it('dismisses a gap and keeps the list the API answers with', async () => {
    const after: ResumeGaps = { ...gaps, requirementGaps: [] };
    mockedGqlRequest.mockResolvedValueOnce({ dismissResumeGap: after });
    const { client, wrapper } = setup();
    const { result } = await renderHook(() => useDismissResumeGap('app-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('Kubernetes');
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining('dismissResumeGap'), {
      applicationId: 'app-1',
      key: 'Kubernetes',
    });
    expect(client.getQueryData(resumeGapsQueryKey('app-1'))).toEqual(after);
  });

  it('adds a requirement as a skill, then refreshes the questions and skills', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ createSkill: { id: 's1' } });
    const { invalidate, wrapper } = setup();
    const { result } = await renderHook(() => useAddGapSkill('app-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('Kubernetes');
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining('createSkill'), {
      input: { name: 'Kubernetes' },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: resumeGapsQueryKey('app-1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['skills'] });
  });

  it('adds a figure to a role as a new bullet in its description', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ updateWorkExperience: { id: 'w1' } });
    const { invalidate, wrapper } = setup();
    const { result } = await renderHook(() => useAddGapMetric('app-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        role: {
          workExperienceId: 'w1',
          company: 'Acme',
          title: 'Engineer',
          description: '- Built it',
        },
        line: 'Cut costs by 20%',
      });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining('updateWorkExperience'), {
      id: 'w1',
      input: { description: '- Built it\n- Cut costs by 20%' },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workExperiences'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: resumeGapsQueryKey('app-1') });
  });
});

describe('usePostingRequirements', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads nothing as null when the posting has not been read', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ postingRequirements: null });
    const { wrapper } = setup();

    const { result } = await renderHook(() => usePostingRequirements('app-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('keeps what a read returns and refreshes the gap questions that depend on it', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ extractPostingRequirements: requirements });
    const { client, invalidate, wrapper } = setup();
    const { result } = await renderHook(() => useExtractPostingRequirements('app-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('extractPostingRequirements'),
      { applicationId: 'app-1' },
    );
    expect(client.getQueryData(postingRequirementsQueryKey('app-1'))).toEqual(requirements);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: resumeGapsQueryKey('app-1') });
  });
});
