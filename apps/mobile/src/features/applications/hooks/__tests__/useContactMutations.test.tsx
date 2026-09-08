import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useCreateContact, useDeleteContact, useUpdateContact } from '../useContactMutations';
import type { Contact } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const contact: Contact = {
  id: 'c1',
  applicationId: '1',
  name: 'Jane Smith',
  role: null,
  email: null,
  phone: null,
  linkedinUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useContactMutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a contact', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ createContact: contact });
    const { result } = await renderHook(() => useCreateContact('1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'Jane Smith' });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      applicationId: '1',
      name: 'Jane Smith',
    });
  });

  it('updates a contact', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ updateContact: contact });
    const { result } = await renderHook(() => useUpdateContact('1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'c1', input: { name: 'Jane S.' } });
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), {
      id: 'c1',
      name: 'Jane S.',
    });
  });

  it('deletes a contact', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ deleteContact: true });
    const { result } = await renderHook(() => useDeleteContact('1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('c1');
    });

    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { id: 'c1' });
  });
});
