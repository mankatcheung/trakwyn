import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useAnalyticsQueries', () => ({
  useAnalyticsApplications: jest.fn(),
  useDocumentVersionOutcomes: jest.fn(),
  useInterviewRoundAnalytics: jest.fn(),
  useOfferAnalytics: jest.fn(),
  useApplicationChannelAnalytics: jest.fn(),
  useResponseTimeAnalytics: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../../i18n/LanguageContext', () => ({
  useLanguage: jest.fn(() => ({ mode: 'system', resolvedLanguage: 'en', setMode: jest.fn() })),
}));
import {
  useAnalyticsApplications,
  useApplicationChannelAnalytics,
  useDocumentVersionOutcomes,
  useInterviewRoundAnalytics,
  useOfferAnalytics,
  useResponseTimeAnalytics,
} from '../../hooks/useAnalyticsQueries';
import { AnalyticsScreen } from '../AnalyticsScreen';
import type { AnalyticsApplication } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseAnalyticsApplications = jest.mocked(useAnalyticsApplications);
const mockedUseDocumentVersionOutcomes = jest.mocked(useDocumentVersionOutcomes);
const mockedUseInterviewRoundAnalytics = jest.mocked(useInterviewRoundAnalytics);
const mockedUseOfferAnalytics = jest.mocked(useOfferAnalytics);
const mockedUseApplicationChannelAnalytics = jest.mocked(useApplicationChannelAnalytics);
const mockedUseResponseTimeAnalytics = jest.mocked(useResponseTimeAnalytics);
const mockedUseTheme = jest.mocked(useTheme);

const apps: AnalyticsApplication[] = [
  {
    id: '1',
    company: 'Acme',
    role: 'Engineer',
    status: 'applied',
    appliedAt: null,
    createdAt: '2026-01-05T00:00:00.000Z',
    likelyGhosted: false,
  },
  {
    id: '2',
    company: 'Globex',
    role: 'Designer',
    status: 'accepted',
    appliedAt: null,
    createdAt: '2026-01-06T00:00:00.000Z',
    likelyGhosted: false,
  },
];

function setEmptyPanelDefaults() {
  mockedUseDocumentVersionOutcomes.mockReturnValue({ data: [], isLoading: false } as never);
  mockedUseInterviewRoundAnalytics.mockReturnValue({
    data: {
      byType: [],
      roundsToOffer: { median: null, sampleSize: 0 },
      roundsToRejection: { median: null, sampleSize: 0 },
    },
    isLoading: false,
  } as never);
  mockedUseOfferAnalytics.mockReturnValue({
    data: { trend: [], byCurrency: [] },
    isLoading: false,
  } as never);
  mockedUseApplicationChannelAnalytics.mockReturnValue({
    data: { bySource: [], byTag: [] },
    isLoading: false,
  } as never);
  mockedUseResponseTimeAnalytics.mockReturnValue({
    data: { timeInStage: [], timeToFirstResponse: { medianDays: null, sampleSize: 0 } },
    isLoading: false,
  } as never);
}

describe('AnalyticsScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    setEmptyPanelDefaults();
  });

  it('shows summary stats computed from the applications', async () => {
    mockedUseAnalyticsApplications.mockReturnValue({
      data: apps,
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { findByText, getByTestId } = await render(<AnalyticsScreen />);

    await findByText('Analytics');
    await waitFor(() => expect(getByTestId('analytics-stat-Total')).toBeTruthy());
    // offer rate: 1 accepted / 2 total = 50%
    const offerRateCard = getByTestId('analytics-stat-Offer rate');
    expect(JSON.stringify(offerRateCard)).toContain('50%');
  });

  it('renders the weekly chart and stage funnel when there is data', async () => {
    mockedUseAnalyticsApplications.mockReturnValue({
      data: apps,
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { findByTestId } = await render(<AnalyticsScreen />);

    await findByTestId('weekly-bar-chart');
    await findByTestId('stage-funnel-chart');
  });

  it('shows an error message on failure', async () => {
    mockedUseAnalyticsApplications.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
    } as never);

    const { findByText } = await render(<AnalyticsScreen />);

    await findByText('Something went wrong. Please try again.');
  });

  it('renders every supplementary analytics section', async () => {
    mockedUseAnalyticsApplications.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { findByTestId } = await render(<AnalyticsScreen />);

    await findByTestId('document-version-outcomes-section');
    await findByTestId('interview-round-analytics-section');
    await findByTestId('offer-analytics-section');
    await findByTestId('application-channel-analytics-section');
    await findByTestId('response-time-analytics-section');
  });
});
