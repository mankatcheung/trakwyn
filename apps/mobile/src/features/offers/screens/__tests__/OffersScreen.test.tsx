import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useOfferQueries', () => ({
  useOffers: jest.fn(),
  useDeleteOffer: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../../i18n/LanguageContext', () => ({ useLanguage: jest.fn() }));
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDeleteOffer, useOffers } from '../../hooks/useOfferQueries';
import { OffersScreen } from '../OffersScreen';
import type { Offer } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { useLanguage } from '../../../../i18n/LanguageContext';

const mockedUseOffers = jest.mocked(useOffers);
const mockedUseDeleteOffer = jest.mocked(useDeleteOffer);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);
const mockedUseLanguage = jest.mocked(useLanguage);

const offers: Offer[] = [
  {
    id: 'offer-1',
    applicationId: 'app-1',
    baseSalary: 150000,
    bonus: 10000,
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

function renderScreen(push = jest.fn()) {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1' } as never);
  mockedUseRouter.mockReturnValue({ push } as never);
  return render(<OffersScreen />);
}

describe('OffersScreen', () => {
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
    jest.clearAllMocks();
    mockedUseDeleteOffer.mockReturnValue({ mutate: jest.fn() } as never);
  });

  it('shows an empty state when there are no offers', async () => {
    mockedUseOffers.mockReturnValue({ data: [], isLoading: false, isError: false } as never);

    const { findByText } = await renderScreen();

    await findByText('No offers yet.');
  });

  it('lists offers and deletes one', async () => {
    mockedUseOffers.mockReturnValue({ data: offers, isLoading: false, isError: false } as never);
    const mutate = jest.fn();
    mockedUseDeleteOffer.mockReturnValue({ mutate } as never);

    const { findByText, getByTestId } = await renderScreen();

    await findByText('$150,000/yr');
    await fireEvent.press(getByTestId('delete-offer-offer-1'));
    expect(mutate).toHaveBeenCalledWith('offer-1');
  });

  it('navigates to the new-offer screen when the FAB is pressed', async () => {
    mockedUseOffers.mockReturnValue({ data: [], isLoading: false, isError: false } as never);
    const push = jest.fn();

    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('add-offer-button'));
    expect(push).toHaveBeenCalledWith('/applications/app-1/offers/new');
  });

  it('navigates to the edit-offer screen when the edit icon is pressed', async () => {
    mockedUseOffers.mockReturnValue({ data: offers, isLoading: false, isError: false } as never);
    const push = jest.fn();

    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('edit-offer-offer-1'));
    expect(push).toHaveBeenCalledWith('/applications/app-1/offers/offer-1/edit');
  });

  it('does not show a compare action even with 2+ offers — compare lives on the all-offers page now', async () => {
    mockedUseOffers.mockReturnValue({
      data: [...offers, { ...offers[0], id: 'offer-2' }],
      isLoading: false,
      isError: false,
    } as never);

    const { queryByTestId } = await renderScreen();

    expect(queryByTestId('compare-offers-button')).toBeNull();
  });
});
