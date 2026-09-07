import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';
import { OfferForm } from '../OfferForm';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseTheme = jest.mocked(useTheme);

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

describe('OfferForm', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('disables save until a base salary is entered', async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = await render(<OfferForm onSubmit={onSubmit} onCancel={jest.fn()} />);

    expect(getByTestId('offer-form-save-button').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(getByTestId('offer-base-salary-input'), '150000');
    expect(getByTestId('offer-form-save-button').props.accessibilityState?.disabled).toBeFalsy();
  });

  it('submits the entered offer data', async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = await render(<OfferForm onSubmit={onSubmit} onCancel={jest.fn()} />);

    await fireEvent.changeText(getByTestId('offer-base-salary-input'), '150000');
    await fireEvent.changeText(getByTestId('offer-bonus-input'), '10000');
    await fireEvent.press(getByTestId('offer-currency-EUR'));
    await fireEvent.press(getByTestId('offer-period-monthly'));
    await fireEvent.changeText(getByTestId('offer-equity-input'), '0.1%');
    await fireEvent.press(getByTestId('offer-form-save-button'));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        baseSalary: 150000,
        bonus: 10000,
        equity: '0.1%',
        benefits: '',
        costOfLivingAdjustment: null,
        currency: 'EUR',
        period: 'monthly',
        notes: '',
      }),
    );
  });

  it('prefills from initialData and calls onCancel', async () => {
    const onCancel = jest.fn();
    const { getByTestId } = await render(
      <OfferForm
        initialData={{
          id: '1',
          applicationId: 'app-1',
          baseSalary: 120000,
          bonus: null,
          equity: null,
          benefits: null,
          costOfLivingAdjustment: null,
          currency: 'USD',
          period: 'yearly',
          notes: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }}
        onSubmit={jest.fn()}
        onCancel={onCancel}
      />,
    );

    expect(getByTestId('offer-base-salary-input').props.value).toBe('120000');

    await fireEvent.press(getByTestId('offer-form-cancel-button'));
    expect(onCancel).toHaveBeenCalled();
  });
});
