import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useOfferQueries', () => ({
  useOffers: jest.fn(),
  useCompareOffers: jest.fn(),
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn() }));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../../i18n/LanguageContext', () => ({ useLanguage: jest.fn() }));
import { useLocalSearchParams } from 'expo-router';
import { useCompareOffers, useOffers } from '../../hooks/useOfferQueries';
import { CompareOffersScreen } from '../CompareOffersScreen';
import type { Offer } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { useLanguage } from '../../../../i18n/LanguageContext';

const mockedUseOffers = jest.mocked(useOffers);
const mockedUseCompareOffers = jest.mocked(useCompareOffers);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseTheme = jest.mocked(useTheme);
const mockedUseLanguage = jest.mocked(useLanguage);

const offers: Offer[] = [
  {
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
  {
    id: 'offer-2',
    applicationId: 'app-1',
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
];

function renderScreen() {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1' } as never);
  return render(<CompareOffersScreen />);
}

describe('CompareOffersScreen', () => {
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

  it('shows an empty state when there are no offers', async () => {
    mockedUseOffers.mockReturnValue({ data: [], isLoading: false } as never);
    mockedUseCompareOffers.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);

    const { findByText } = await renderScreen();

    await findByText('No offers to compare.');
  });

  it('disables compare until two offers are selected, then shows the results', async () => {
    mockedUseOffers.mockReturnValue({ data: offers, isLoading: false } as never);
    const mutateAsync = jest.fn().mockResolvedValue([
      {
        offer: offers[0],
        company: 'Stripe',
        role: 'Engineer',
        normalizedYearlySalary: 150000,
        totalCompensation: 150000,
      },
      {
        offer: offers[1],
        company: 'Notion',
        role: 'Engineer',
        normalizedYearlySalary: 140000,
        totalCompensation: 140000,
      },
    ]);
    mockedUseCompareOffers.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId, findByText } = await renderScreen();

    expect(getByTestId('run-compare-button').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(getByTestId('compare-offer-option-offer-1'));
    await fireEvent.press(getByTestId('compare-offer-option-offer-2'));
    expect(getByTestId('run-compare-button').props.accessibilityState?.disabled).toBeFalsy();

    await fireEvent.press(getByTestId('run-compare-button'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(['offer-1', 'offer-2']));
    await findByText('Stripe  · Best');
  });
});
