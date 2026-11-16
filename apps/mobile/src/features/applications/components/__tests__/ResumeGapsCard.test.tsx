import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../../i18n';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { ResumeGapsCard } from '../ResumeGapsCard';
import type { ResumeGaps } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);

const gaps: ResumeGaps = {
  requirementsRead: true,
  requirementGaps: ['Kubernetes'],
  rolesWithoutMetrics: [
    { workExperienceId: 'w1', company: 'Acme', title: 'Engineer', description: '- Built it' },
  ],
};

function mockApi(initial: ResumeGaps, overrides: Record<string, unknown> = {}) {
  mockedGqlRequest.mockImplementation((document: string) => {
    for (const [name, answer] of Object.entries(overrides)) {
      if (document.includes(name)) {
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
      }
    }
    return Promise.resolve({ resumeGaps: initial });
  });
}

async function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = await render(
    <QueryClientProvider client={client}>
      <ResumeGapsCard applicationId="app-1" />
    </QueryClientProvider>,
  );
  return view;
}

async function open(view: Awaited<ReturnType<typeof renderCard>>) {
  await fireEvent.press(await view.findByTestId('resume-gaps-card-toggle'));
}

describe('ResumeGapsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTheme).mockReturnValue({ colors: lightColors } as never);
  });

  it('shows nothing when there is nothing to ask', async () => {
    mockApi({ requirementsRead: true, requirementGaps: [], rolesWithoutMetrics: [] });
    const { queryByTestId } = await renderCard();
    await waitFor(() => expect(mockedGqlRequest).toHaveBeenCalled());
    expect(queryByTestId('resume-gaps-card')).toBeNull();
  });

  it('counts the questions in the header and lists them when opened', async () => {
    mockApi(gaps);
    const view = await renderCard();
    expect(await view.findByText('2')).toBeTruthy();

    await open(view);

    expect(view.getByTestId('resume-gap-requirement-Kubernetes')).toBeTruthy();
    expect(view.getByTestId('resume-gap-role-w1')).toBeTruthy();
  });

  it('explains what is missing when the posting has not been read', async () => {
    mockApi({ requirementsRead: false, requirementGaps: [], rolesWithoutMetrics: [] });
    const view = await renderCard();

    await open(view);

    expect(view.getByText(/Read the posting’s requirements above/)).toBeTruthy();
  });

  it('adds a requirement to the skills on "yes"', async () => {
    mockApi(gaps, { createSkill: { createSkill: { id: 's1' } } });
    const view = await renderCard();
    await open(view);

    await fireEvent.press(view.getByTestId('resume-gap-add-skill-Kubernetes'));

    await waitFor(() =>
      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining('createSkill'), {
        input: { name: 'Kubernetes' },
      }),
    );
    expect(await view.findByTestId('resume-gaps-saved')).toBeTruthy();
  });

  it('dismisses a requirement on "no", and the next answer drops it', async () => {
    mockApi(gaps, {
      dismissResumeGap: {
        dismissResumeGap: { ...gaps, requirementGaps: [] },
      },
    });
    const view = await renderCard();
    await open(view);

    await fireEvent.press(view.getByTestId('resume-gap-dismiss-Kubernetes'));

    await waitFor(() =>
      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining('dismissResumeGap'), {
        applicationId: 'app-1',
        key: 'Kubernetes',
      }),
    );
    await waitFor(() => expect(view.queryByTestId('resume-gap-requirement-Kubernetes')).toBeNull());
  });

  it('skips a role under its own key', async () => {
    mockApi(gaps, {
      dismissResumeGap: { dismissResumeGap: { ...gaps, rolesWithoutMetrics: [] } },
    });
    const view = await renderCard();
    await open(view);

    await fireEvent.press(view.getByTestId('resume-gap-skip-role-w1'));

    await waitFor(() =>
      expect(mockedGqlRequest).toHaveBeenCalledWith(expect.stringContaining('dismissResumeGap'), {
        applicationId: 'app-1',
        key: 'role:w1',
      }),
    );
  });

  it('refuses a result with no number in it, and sends nothing', async () => {
    mockApi(gaps);
    const view = await renderCard();
    await open(view);

    await fireEvent.changeText(view.getByTestId('resume-gap-metric-input-w1'), 'Led the team');
    await fireEvent.press(view.getByTestId('resume-gap-add-metric-w1'));

    expect(await view.findByTestId('resume-gap-metric-problem-w1')).toBeTruthy();
    expect(
      mockedGqlRequest.mock.calls.some(([d]) => String(d).includes('updateWorkExperience')),
    ).toBe(false);
  });

  it('appends a result with a number to the role description', async () => {
    mockApi(gaps, { updateWorkExperience: { updateWorkExperience: { id: 'w1' } } });
    const view = await renderCard();
    await open(view);

    await fireEvent.changeText(view.getByTestId('resume-gap-metric-input-w1'), 'Led a team of 5');
    await fireEvent.press(view.getByTestId('resume-gap-add-metric-w1'));

    await waitFor(() =>
      expect(mockedGqlRequest).toHaveBeenCalledWith(
        expect.stringContaining('updateWorkExperience'),
        {
          id: 'w1',
          input: { description: '- Built it\n- Led a team of 5' },
        },
      ),
    );
  });

  it('shows the error when an answer cannot be saved', async () => {
    mockApi(gaps, {
      dismissResumeGap: Object.assign(new Error('x'), {
        response: { errors: [{ message: 'Could not dismiss' }] },
      }),
    });
    const view = await renderCard();
    await open(view);

    await fireEvent.press(view.getByTestId('resume-gap-dismiss-Kubernetes'));

    expect(await view.findByText('Could not dismiss')).toBeTruthy();
  });
});
