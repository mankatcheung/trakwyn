import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../settings/hooks/useExperience', () => ({
  useWorkExperiences: jest.fn(),
  useEducations: jest.fn(),
  useSkills: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useRouter } from 'expo-router';
import {
  useEducations,
  useSkills,
  useWorkExperiences,
} from '../../../settings/hooks/useExperience';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { CvProfileSummaryCard } from '../CvProfileSummaryCard';

const mockedWork = jest.mocked(useWorkExperiences);
const mockedEducation = jest.mocked(useEducations);
const mockedSkills = jest.mocked(useSkills);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

const role = (over: Record<string, unknown> = {}) => ({
  id: 'w1',
  company: 'Acme Corp',
  title: 'Software Engineer',
  location: null,
  startDate: '2022-03-01',
  endDate: null,
  description: 'Built things',
  ...over,
});

function setQueries(work: unknown, education: unknown, skills: unknown) {
  mockedWork.mockReturnValue(work as never);
  mockedEducation.mockReturnValue(education as never);
  mockedSkills.mockReturnValue(skills as never);
}

const loaded = (data: unknown[]) => ({ data, isLoading: false, isError: false });

async function renderCard(push = jest.fn()) {
  mockedUseRouter.mockReturnValue({ push } as never);
  return { push, ...(await render(<CvProfileSummaryCard />)) };
}

describe('CvProfileSummaryCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('shows a spinner while any of the three queries is loading', async () => {
    setQueries({ data: undefined, isLoading: true, isError: false }, loaded([]), loaded([]));
    const { getByTestId, queryByTestId } = await renderCard();
    expect(getByTestId('dashboard-cv-profile-card')).toBeTruthy();
    expect(getByTestId('dashboard-cv-profile-loading')).toBeTruthy();
    expect(queryByTestId('dashboard-cv-profile-fill-in')).toBeNull();
  });

  it('renders nothing when a query fails, so the dashboard shows no second error', async () => {
    setQueries(loaded([role()]), { data: undefined, isLoading: false, isError: true }, loaded([]));
    const { queryByTestId } = await renderCard();
    expect(queryByTestId('dashboard-cv-profile-card')).toBeNull();
  });

  it('invites an empty profile to be filled in', async () => {
    setQueries(loaded([]), loaded([]), loaded([]));
    const { getByTestId, getByText, push } = await renderCard();
    expect(getByText('Fill in your profile')).toBeTruthy();
    await fireEvent.press(getByTestId('dashboard-cv-profile-fill-in'));
    expect(push).toHaveBeenCalledWith('./profile');
  });

  it('summarises a filled profile: latest role, counts and completeness', async () => {
    setQueries(
      loaded([
        role({ id: 'w1', title: 'Junior Developer', company: 'Agency', endDate: '2020-05-31' }),
        role({ id: 'w2' }),
      ]),
      loaded([{ id: 'e1' }]),
      loaded([{ id: 's1' }, { id: 's2' }]),
    );
    const { getByText } = await renderCard();
    expect(getByText('Software Engineer at Acme Corp')).toBeTruthy();
    expect(getByText('2 roles')).toBeTruthy();
    expect(getByText('1 education entry')).toBeTruthy();
    expect(getByText('2 skills')).toBeTruthy();
    expect(getByText('Profile 75% complete')).toBeTruthy();
  });

  it('opens the profile editor when the card is pressed', async () => {
    setQueries(loaded([role()]), loaded([]), loaded([]));
    const { getByTestId, push } = await renderCard();
    await fireEvent.press(getByTestId('dashboard-cv-profile-card'));
    expect(push).toHaveBeenCalledWith('./profile');
  });
});
