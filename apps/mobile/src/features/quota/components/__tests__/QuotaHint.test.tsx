import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../../i18n';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { quotaLevel } from '../../lib/quotaLevel';
import { QuotaHint } from '../QuotaHint';

const mockedGqlRequest = jest.mocked(gqlRequest);

const LIMITS = {
  notesPerApplication: 10,
  contactsPerApplication: 10,
  interviewRoundsPerApplication: 10,
  offersPerApplication: 10,
  tagsPerApplication: 10,
  documentDraftsPerApplication: 10,
  conversationsPerUser: 50,
  workExperiencesPerUser: 20,
  educationsPerUser: 20,
  skillsPerUser: 100,
  shareLinksPerUser: 10,
  apiTokensPerUser: 10,
};
const USAGE = {
  conversations: 0,
  workExperiences: 0,
  educations: 0,
  skills: 92,
  shareLinks: 10,
  apiTokens: 0,
};

async function renderHint(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('quotaLevel', () => {
  it('is ok below 80%, warning from 80%, full at the limit', () => {
    expect(quotaLevel(7, 10)).toBe('ok');
    expect(quotaLevel(8, 10)).toBe('warning');
    expect(quotaLevel(10, 10)).toBe('full');
    expect(quotaLevel(11, 10)).toBe('full');
  });
});

describe('QuotaHint', () => {
  beforeEach(() => {
    jest.mocked(useTheme).mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    mockedGqlRequest.mockReset();
    mockedGqlRequest.mockResolvedValue({ contentQuota: { limits: LIMITS, usage: USAGE } });
  });

  it('shows nothing while usage is low', async () => {
    const { queryByTestId } = await renderHint(<QuotaHint resource="notes" used={3} />);
    await waitFor(() => expect(mockedGqlRequest).toHaveBeenCalled());
    expect(queryByTestId('quota-hint-warning')).toBeNull();
    expect(queryByTestId('quota-hint-full')).toBeNull();
  });

  it('shows "N of M" from 80% of a per-application limit', async () => {
    const { findByText } = await renderHint(<QuotaHint resource="notes" used={9} />);
    expect(await findByText('9 of 10 notes')).toBeTruthy();
  });

  it('reads per-user usage from the API', async () => {
    const { findByText } = await renderHint(<QuotaHint resource="skills" />);
    expect(await findByText('92 of 100 skills')).toBeTruthy();
  });

  it('names the limit at the cap', async () => {
    const { findByText } = await renderHint(<QuotaHint resource="shareLinks" />);
    expect(
      await findByText('Limit reached: 10 share links. Delete one to add another.'),
    ).toBeTruthy();
  });
});
