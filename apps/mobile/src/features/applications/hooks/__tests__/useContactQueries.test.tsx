import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useContacts } from '../useContactQueries';
import type { Contact } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const contact: Contact = {
  id: 'c1',
  applicationId: '1',
  name: 'Jane Smith',
  role: 'Recruiter',
  email: 'jane@example.com',
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

describe('useContactQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches contacts for an application', async () => {
    mockedGqlRequest.mockResolvedValueOnce({ contacts: [contact] });

    const { result } = await renderHook(() => useContacts('1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([contact]);
    expect(mockedGqlRequest).toHaveBeenCalledWith(expect.any(String), { applicationId: '1' });
  });

  it('does not fetch when the applicationId is empty', async () => {
    const { result } = await renderHook(() => useContacts(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedGqlRequest).not.toHaveBeenCalled();
  });
});
