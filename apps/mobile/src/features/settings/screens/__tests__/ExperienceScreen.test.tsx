import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useExperience', () => ({
  useWorkExperiences: jest.fn(),
  useCreateWorkExperience: jest.fn(),
  useUpdateWorkExperience: jest.fn(),
  useDeleteWorkExperience: jest.fn(),
  useEducations: jest.fn(),
  useCreateEducation: jest.fn(),
  useUpdateEducation: jest.fn(),
  useDeleteEducation: jest.fn(),
  useSkills: jest.fn(),
  useCreateSkill: jest.fn(),
  useDeleteSkill: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import {
  useCreateEducation,
  useCreateSkill,
  useCreateWorkExperience,
  useDeleteEducation,
  useDeleteSkill,
  useDeleteWorkExperience,
  useEducations,
  useSkills,
  useUpdateEducation,
  useUpdateWorkExperience,
  useWorkExperiences,
} from '../../hooks/useExperience';
import { ExperienceScreen } from '../ExperienceScreen';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseWorkExperiences = jest.mocked(useWorkExperiences);
const mockedUseCreateWorkExperience = jest.mocked(useCreateWorkExperience);
const mockedUseUpdateWorkExperience = jest.mocked(useUpdateWorkExperience);
const mockedUseDeleteWorkExperience = jest.mocked(useDeleteWorkExperience);
const mockedUseEducations = jest.mocked(useEducations);
const mockedUseCreateEducation = jest.mocked(useCreateEducation);
const mockedUseUpdateEducation = jest.mocked(useUpdateEducation);
const mockedUseDeleteEducation = jest.mocked(useDeleteEducation);
const mockedUseSkills = jest.mocked(useSkills);
const mockedUseCreateSkill = jest.mocked(useCreateSkill);
const mockedUseDeleteSkill = jest.mocked(useDeleteSkill);
const mockedUseTheme = jest.mocked(useTheme);

function setDefaults() {
  mockedUseWorkExperiences.mockReturnValue({ data: [], isLoading: false } as never);
  mockedUseCreateWorkExperience.mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  } as never);
  mockedUseUpdateWorkExperience.mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  } as never);
  mockedUseDeleteWorkExperience.mockReturnValue({ mutate: jest.fn() } as never);
  mockedUseEducations.mockReturnValue({ data: [], isLoading: false } as never);
  mockedUseCreateEducation.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
  mockedUseUpdateEducation.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
  mockedUseDeleteEducation.mockReturnValue({ mutate: jest.fn() } as never);
  mockedUseSkills.mockReturnValue({ data: [], isLoading: false } as never);
  mockedUseCreateSkill.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
  mockedUseDeleteSkill.mockReturnValue({ mutate: jest.fn() } as never);
}

describe('ExperienceScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    setDefaults();
  });

  it('adds a work experience entry', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ id: '1' });
    mockedUseCreateWorkExperience.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId } = await render(<ExperienceScreen />);

    await fireEvent.press(getByTestId('add-work-experience-button'));
    await fireEvent.changeText(getByTestId('work-experience-company-input'), 'Acme');
    await fireEvent.changeText(getByTestId('work-experience-title-input'), 'Engineer');
    await fireEvent.changeText(getByTestId('work-experience-start-input'), '2024-01-01');
    await fireEvent.press(getByTestId('save-work-experience-button'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        company: 'Acme',
        title: 'Engineer',
        startDate: '2024-01-01',
        endDate: undefined,
      }),
    );
  });

  it('deletes a work experience entry', async () => {
    mockedUseWorkExperiences.mockReturnValue({
      data: [
        {
          id: 'we-1',
          company: 'Acme',
          title: 'Engineer',
          location: null,
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: null,
          description: null,
        },
      ],
      isLoading: false,
    } as never);
    const mutate = jest.fn();
    mockedUseDeleteWorkExperience.mockReturnValue({ mutate } as never);

    const { getByTestId } = await render(<ExperienceScreen />);

    await fireEvent.press(getByTestId('delete-work-experience-we-1'));

    expect(mutate).toHaveBeenCalledWith('we-1');
  });

  it('adds an education entry', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ id: '1' });
    mockedUseCreateEducation.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId } = await render(<ExperienceScreen />);

    await fireEvent.press(getByTestId('add-education-button'));
    await fireEvent.changeText(getByTestId('education-institution-input'), 'MIT');
    await fireEvent.changeText(getByTestId('education-start-input'), '2020-09-01');
    await fireEvent.press(getByTestId('save-education-button'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        institution: 'MIT',
        degree: undefined,
        startDate: '2020-09-01',
        endDate: undefined,
      }),
    );
  });

  it('adds and deletes a skill', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ id: '1' });
    mockedUseCreateSkill.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockedUseSkills.mockReturnValue({
      data: [{ id: 'sk-1', name: 'TypeScript', category: null, proficiency: null }],
      isLoading: false,
    } as never);
    const deleteMutate = jest.fn();
    mockedUseDeleteSkill.mockReturnValue({ mutate: deleteMutate } as never);

    const { getByTestId } = await render(<ExperienceScreen />);

    await fireEvent.press(getByTestId('add-skill-button'));
    await fireEvent.changeText(getByTestId('skill-name-input'), 'Go');
    await fireEvent.press(getByTestId('save-skill-button'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ name: 'Go' }));

    await fireEvent.press(getByTestId('delete-skill-sk-1'));
    expect(deleteMutate).toHaveBeenCalledWith('sk-1');
  });
});
