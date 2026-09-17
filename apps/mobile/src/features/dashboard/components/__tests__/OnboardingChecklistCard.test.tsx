import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useDashboardQueries', () => ({
  useDismissOnboardingChecklist: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useRouter } from 'expo-router';
import { useDismissOnboardingChecklist } from '../../hooks/useDashboardQueries';
import { OnboardingChecklistCard } from '../OnboardingChecklistCard';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import type { OnboardingChecklistData } from '../../types';

const mockedUseDismiss = jest.mocked(useDismissOnboardingChecklist);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

const baseData: OnboardingChecklistData = {
  me: { onboardingChecklistDismissedAt: null },
  apiTokens: [],
  llmApiKeys: [],
  workExperiences: [],
};

function renderCard(
  data: OnboardingChecklistData = baseData,
  hasApplications = false,
  push = jest.fn(),
) {
  mockedUseRouter.mockReturnValue({ push, replace: jest.fn() } as never);
  return render(<OnboardingChecklistCard data={data} hasApplications={hasApplications} />);
}

describe('OnboardingChecklistCard', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    mockedUseDismiss.mockReturnValue({ mutate } as never);
  });

  it('shows all items unchecked when nothing is complete, expanded by default', async () => {
    const { getByText, getByTestId } = await renderCard();

    expect(getByTestId('onboarding-checklist')).toBeTruthy();
    expect(getByText('Get started with Trakwyn')).toBeTruthy();
    expect(getByText('Create your first job application')).toBeTruthy();
    expect(getByText('Connect MCP by generating an API token')).toBeTruthy();
    expect(getByText('Add an AI provider API key')).toBeTruthy();
    expect(getByText('Add your work experience and skills')).toBeTruthy();
  });

  it('collapses and expands when the header is pressed', async () => {
    const { findByText, getByTestId, queryByText } = await renderCard();

    await findByText('Create your first job application');
    fireEvent.press(getByTestId('onboarding-checklist-toggle'));
    await waitFor(() => expect(queryByText('Create your first job application')).toBeNull());

    fireEvent.press(getByTestId('onboarding-checklist-toggle'));
    await findByText('Create your first job application');
  });

  it('renders nothing when dismissed', async () => {
    const { queryByTestId } = await renderCard({
      ...baseData,
      me: { onboardingChecklistDismissedAt: '2026-01-01T00:00:00.000Z' },
    });

    expect(queryByTestId('onboarding-checklist')).toBeNull();
  });

  it('renders nothing when all four items are complete', async () => {
    const { queryByTestId } = await renderCard(
      {
        ...baseData,
        apiTokens: [{ id: 'token-1' }],
        llmApiKeys: [{ provider: 'openai' }],
        workExperiences: [{ id: 'exp-1' }],
      },
      true,
    );

    expect(queryByTestId('onboarding-checklist')).toBeNull();
  });

  it('navigates to the underlying screen when an item is pressed', async () => {
    const push = jest.fn();
    const { getByTestId } = await renderCard(baseData, false, push);

    fireEvent.press(getByTestId('onboarding-checklist-item-mcp'));

    expect(push).toHaveBeenCalledWith('/(tabs)/settings/integrations');
  });

  it('dismisses the checklist via the mutation', async () => {
    const { getByLabelText } = await renderCard();

    fireEvent.press(getByLabelText('Dismiss checklist'));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
  });
});
