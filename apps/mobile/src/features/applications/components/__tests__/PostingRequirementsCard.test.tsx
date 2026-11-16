import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../../i18n';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../ai/hooks/useAiCredits', () => ({ useAiCredits: jest.fn() }));
jest.mock('../../../ai/hooks/useRefreshAiCredits', () => ({
  useRefreshAiCredits: () => jest.fn(),
}));
jest.mock('../../../settings/components/AiCreditsExhaustedNotice', () => {
  const { Text } = require('react-native');
  return {
    AiCreditsExhaustedNotice: () => <Text testID="credits-exhausted-notice">exhausted</Text>,
  };
});

import { useAiCredits } from '../../../ai/hooks/useAiCredits';
import { exhaustedCredits, ownKeyCredits } from '../../../ai/testing/aiCreditsFixture';
import { gqlRequest } from '../../../../graphql/client';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { PostingRequirementsCard } from '../PostingRequirementsCard';
import type { PostingRequirements } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const requirements: PostingRequirements = {
  id: 'r1',
  applicationId: 'app-1',
  mustHave: ['5 years of TypeScript'],
  niceToHave: ['GraphQL'],
  keywords: ['React', 'Node'],
  seniority: 'Senior',
  generatedAt: '2026-11-01T00:00:00.000Z',
  isStale: false,
};

function mockApi(opts: {
  saved: PostingRequirements | null;
  extract?: unknown;
  extractError?: unknown;
}) {
  mockedGqlRequest.mockImplementation((document: string) => {
    if (document.includes('mutation ExtractPostingRequirements')) {
      return opts.extractError
        ? Promise.reject(opts.extractError)
        : Promise.resolve({ extractPostingRequirements: opts.extract });
    }
    return Promise.resolve({ postingRequirements: opts.saved });
  });
}

async function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PostingRequirementsCard applicationId="app-1" />
    </QueryClientProvider>,
  );
}

describe('PostingRequirementsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTheme).mockReturnValue({ colors: lightColors } as never);
    jest.mocked(useAiCredits).mockReturnValue(ownKeyCredits());
  });

  it('offers to read a posting that has not been read, and shows the result', async () => {
    mockApi({ saved: null, extract: requirements });
    const { findByTestId, getByTestId, findByText, getByText } = await renderCard();

    await fireEvent.press(await findByTestId('posting-requirements-card-toggle'));
    expect(getByText(/Read the posting with AI/)).toBeTruthy();

    await fireEvent.press(getByTestId('extract-posting-requirements-button'));

    expect(await findByText('• 5 years of TypeScript')).toBeTruthy();
    expect(getByText('• GraphQL')).toBeTruthy();
    expect(getByText('React')).toBeTruthy();
    expect(getByText('Senior')).toBeTruthy();
  });

  it('shows saved requirements without calling AI, and no button while they are current', async () => {
    mockApi({ saved: requirements });
    const { findByTestId, findByText, queryByTestId } = await renderCard();

    await fireEvent.press(await findByTestId('posting-requirements-card-toggle'));

    expect(await findByText('• 5 years of TypeScript')).toBeTruthy();
    expect(queryByTestId('extract-posting-requirements-button')).toBeNull();
    expect(mockedGqlRequest.mock.calls.some(([d]) => String(d).includes('mutation'))).toBe(false);
  });

  it('warns that a stale list is out of date and offers to read again', async () => {
    mockApi({ saved: { ...requirements, isStale: true } });
    const { findByTestId, findByText, getByTestId } = await renderCard();

    await fireEvent.press(await findByTestId('posting-requirements-card-toggle'));

    expect(await findByText(/posting has changed/)).toBeTruthy();
    expect(getByTestId('extract-posting-requirements-button')).toBeTruthy();
  });

  it('shows the API error when reading fails', async () => {
    mockApi({
      saved: null,
      extractError: { response: { errors: [{ message: 'The posting could not be read' }] } },
    });
    const { findByTestId, getByTestId, findByText } = await renderCard();

    await fireEvent.press(await findByTestId('posting-requirements-card-toggle'));
    await fireEvent.press(getByTestId('extract-posting-requirements-button'));

    expect(await findByText('The posting could not be read')).toBeTruthy();
  });

  it('shows the credits notice, and disables reading, when the credits are spent', async () => {
    mockApi({ saved: null });
    jest.mocked(useAiCredits).mockReturnValue(exhaustedCredits());
    const { findByTestId, getByTestId } = await renderCard();

    await fireEvent.press(await findByTestId('posting-requirements-card-toggle'));

    expect(getByTestId('credits-exhausted-notice')).toBeTruthy();
    expect(
      getByTestId('extract-posting-requirements-button').props.accessibilityState?.disabled,
    ).toBe(true);
  });

  it('shows the credits notice when the API says the credits ran out', async () => {
    mockApi({
      saved: null,
      extractError: {
        response: {
          errors: [{ message: 'Out of credits', extensions: { code: 'AI_CREDITS_EXHAUSTED' } }],
        },
      },
    });
    const { findByTestId, getByTestId } = await renderCard();

    await fireEvent.press(await findByTestId('posting-requirements-card-toggle'));
    await fireEvent.press(getByTestId('extract-posting-requirements-button'));

    await waitFor(() => expect(getByTestId('credits-exhausted-notice')).toBeTruthy());
  });
});
