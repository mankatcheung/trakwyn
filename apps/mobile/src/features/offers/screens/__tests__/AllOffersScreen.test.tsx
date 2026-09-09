import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useOfferQueries', () => ({
  useAllOffers: jest.fn(),
  useCompareOffers: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../../i18n/LanguageContext', () => ({ useLanguage: jest.fn() }));
import { useAllOffers, useCompareOffers } from '../../hooks/useOfferQueries';
import { AllOffersScreen } from '../AllOffersScreen';
import type { OfferWithApplication } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { useLanguage } from '../../../../i18n/LanguageContext';

const mockedUseAllOffers = jest.mocked(useAllOffers);
const mockedUseCompareOffers = jest.mocked(useCompareOffers);
const mockedUseTheme = jest.mocked(useTheme);
const mockedUseLanguage = jest.mocked(useLanguage);

const entries: OfferWithApplication[] = [
  {
    company: 'Stripe',
    role: 'Engineer',
    offer: {
      id: 'offer-1',
      applicationId: 'app-1',
      baseSalary: 150000,
      bonus: null,
      equity: null,
      benefits: null,
      costOfLivingAdjustment: null,
      currency: 'USD',
      period: 'yearly',
      notes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  },
  {
    company: 'Notion',
    role: 'Staff Engineer',
    offer: {
      id: 'offer-2',
      applicationId: 'app-2',
      baseSalary: 140000,
      bonus: null,
      equity: null,
      benefits: null,
      costOfLivingAdjustment: null,
      currency: 'USD',
      period: 'yearly',
      notes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  },
];

function renderScreen() {
  return render(<AllOffersScreen />);
}

describe('AllOffersScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    mockedUseLanguage.mockReturnValue({
      mode: 'en',
      resolvedLanguage: 'en',
      supportedLanguages: [],
      setMode: jest.fn(),
    });
  });

  beforeEach(() => jest.clearAllMocks());

  it('shows an empty state when the user has no offers across any application', async () => {
    mockedUseAllOffers.mockReturnValue({ data: [], isLoading: false } as never);
    mockedUseCompareOffers.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);

    const { findByText } = await renderScreen();

    await findByText('No offers to compare.');
  });

  it('lists offers from every application with company and role, and select all selects every offer', async () => {
    mockedUseAllOffers.mockReturnValue({ data: entries, isLoading: false } as never);
    const mutateAsync = jest.fn().mockResolvedValue([
      {
        offer: entries[0].offer,
        company: 'Stripe',
        role: 'Engineer',
        normalizedYearlySalary: 150000,
        totalCompensation: 150000,
      },
      {
        offer: entries[1].offer,
        company: 'Notion',
        role: 'Staff Engineer',
        normalizedYearlySalary: 140000,
        totalCompensation: 140000,
      },
    ]);
    mockedUseCompareOffers.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId, findByText } = await renderScreen();

    await findByText(/Stripe.*Engineer/);
    expect(getByTestId('run-compare-button').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(getByTestId('select-all-offers'));
    expect(getByTestId('run-compare-button').props.accessibilityState?.disabled).toBeFalsy();

    await fireEvent.press(getByTestId('run-compare-button'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(['offer-1', 'offer-2']));
    await findByText('BEST');
  });
});
