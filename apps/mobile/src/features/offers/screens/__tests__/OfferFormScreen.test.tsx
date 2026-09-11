import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useOfferQueries', () => ({
  useOffers: jest.fn(),
  useCreateOffer: jest.fn(),
  useUpdateOffer: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateOffer, useOffers, useUpdateOffer } from '../../hooks/useOfferQueries';
import { OfferFormScreen } from '../OfferFormScreen';
import type { Offer } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseOffers = jest.mocked(useOffers);
const mockedUseCreateOffer = jest.mocked(useCreateOffer);
const mockedUseUpdateOffer = jest.mocked(useUpdateOffer);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseTheme = jest.mocked(useTheme);

const existing: Offer = {
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
};

function renderScreen(offerId: string | undefined, back = jest.fn()) {
  mockedUseRouter.mockReturnValue({ back } as never);
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1', offerId } as never);
  return render(<OfferFormScreen />);
}

describe('OfferFormScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseOffers.mockReturnValue({ data: [], isLoading: false } as never);
  });

  it('creates a new offer from the empty form', async () => {
    const back = jest.fn();
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'offer-2' });
    mockedUseCreateOffer.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockedUseUpdateOffer.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);

    const { getByTestId } = await renderScreen(undefined, back);

    await fireEvent.changeText(getByTestId('offer-base-salary-input'), '150000');
    await fireEvent.press(getByTestId('offer-form-save-button'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ baseSalary: 150000 }));
    expect(back).toHaveBeenCalled();
  });

  it('prefills and updates an existing offer', async () => {
    const back = jest.fn();
    const mutateAsync = jest.fn().mockResolvedValue({ id: 'offer-1' });
    mockedUseOffers.mockReturnValue({ data: [existing], isLoading: false } as never);
    mockedUseCreateOffer.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
    mockedUseUpdateOffer.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId, getByDisplayValue } = await renderScreen('offer-1', back);

    await waitFor(() => expect(getByDisplayValue('150000')).toBeTruthy());

    await fireEvent.changeText(getByTestId('offer-base-salary-input'), '160000');
    await fireEvent.press(getByTestId('offer-form-save-button'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith({
      offerId: 'offer-1',
      data: expect.objectContaining({ baseSalary: 160000 }),
    });
    expect(back).toHaveBeenCalled();
  });

  it('shows a loading indicator while fetching the offer to edit', async () => {
    mockedUseOffers.mockReturnValue({ data: undefined, isLoading: true } as never);
    mockedUseCreateOffer.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
    mockedUseUpdateOffer.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);

    const { getByTestId } = await renderScreen('offer-1');

    expect(getByTestId('offer-form-loading')).toBeTruthy();
  });

  it('navigates back on cancel', async () => {
    const back = jest.fn();
    mockedUseCreateOffer.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
    mockedUseUpdateOffer.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);

    const { getByTestId } = await renderScreen(undefined, back);

    await fireEvent.press(getByTestId('offer-form-cancel-button'));
    expect(back).toHaveBeenCalled();
  });
});
