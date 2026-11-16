import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import {
  useAwards,
  useCertifications,
  useCreateAward,
  useCreateCertification,
  useCreateLanguage,
  useCreateProject,
  useDeleteCertification,
  useDeleteLanguage,
  useLanguages,
  useProjects,
  useUpdateProject,
} from '../useProfileSections';

const mockedGqlRequest = jest.mocked(gqlRequest);

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidate };
}

describe('useProfileSections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['certifications', useCertifications, 'certifications'],
    ['languages', useLanguages, 'languages'],
    ['projects', useProjects, 'projects'],
    ['awards', useAwards, 'awards'],
  ] as const)('lists %s from the API', async (_name, hook, field) => {
    const row = { id: '1' };
    mockedGqlRequest.mockResolvedValueOnce({ [field]: [row] });
    const { wrapper } = makeWrapper();

    const { result } = await renderHook(() => hook(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([row]);
    expect(mockedGqlRequest.mock.calls[0][0]).toContain(`query`);
    expect(mockedGqlRequest.mock.calls[0][0]).toContain(field);
  });

  it('sends the input of a create and refreshes that list', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ createCertification: { id: '1' } });
    const { wrapper, invalidate } = makeWrapper();
    const { result } = await renderHook(() => useCreateCertification(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'AWS SAA', issuer: 'Amazon' });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining('createCertification'), {
      input: { name: 'AWS SAA', issuer: 'Amazon' },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['certifications'] });
  });

  it('sends an id and input on update, and null to clear a field', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ updateProject: { id: 'p1' } });
    const { wrapper, invalidate } = makeWrapper();
    const { result } = await renderHook(() => useUpdateProject(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'p1', input: { name: 'Trakwyn', role: null } });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining('updateProject'), {
      id: 'p1',
      input: { name: 'Trakwyn', role: null },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects'] });
  });

  it.each([
    ['language', useDeleteLanguage, 'deleteLanguage', 'languages'],
    ['certification', useDeleteCertification, 'deleteCertification', 'certifications'],
  ] as const)('deletes a %s by id and refreshes the list', async (_n, hook, mutation, key) => {
    mockedGqlRequest.mockResolvedValueOnce({ [mutation]: true });
    const { wrapper, invalidate } = makeWrapper();
    const { result } = await renderHook(() => hook(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('x1');
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining(mutation), { id: 'x1' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
  });

  it('creates a language and an award with their own documents', async () => {
    mockedGqlRequest.mockResolvedValue({});
    const { wrapper } = makeWrapper();
    const lang = await renderHook(() => useCreateLanguage(), { wrapper });
    const award = await renderHook(() => useCreateAward(), { wrapper });
    const project = await renderHook(() => useCreateProject(), { wrapper });

    await act(async () => {
      await lang.result.current.mutateAsync({ name: 'French' });
      await award.result.current.mutateAsync({ title: 'Dean’s list' });
      await project.result.current.mutateAsync({ name: 'Side project' });
    });

    const docs = mockedGqlRequest.mock.calls.map((c) => c[0]);
    expect(docs[0]).toContain('createLanguage');
    expect(docs[1]).toContain('createAward');
    expect(docs[2]).toContain('createProject');
  });
});
