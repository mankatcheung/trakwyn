import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest, mockCapture } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockCapture: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/analytics')>()),
  captureEvent: mockCapture,
}));

import { ResumeGapsPanel } from '#/routes/_authenticated/applications/$applicationId/-components/ResumeGapsPanel';
import {
  appendToDescription,
  type ResumeGaps,
} from '#/routes/_authenticated/applications/$applicationId/-resumeGapsQueries';

const gaps: ResumeGaps = {
  requirementsRead: true,
  requirementGaps: ['Terraform', 'Kafka'],
  rolesWithoutMetrics: [
    {
      workExperienceId: 'we-1',
      company: 'Acme',
      title: 'Engineer',
      description: 'Ran the platform.',
    },
  ],
};
const nothing: ResumeGaps = {
  requirementsRead: true,
  requirementGaps: [],
  rolesWithoutMetrics: [],
};

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ResumeGapsPanel applicationId="app-1" />
    </QueryClientProvider>,
  );
}

describe('ResumeGapsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows nothing when there is nothing to ask', async () => {
    mockGqlRequest.mockResolvedValue({ resumeGaps: nothing });

    const { container } = renderPanel();

    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('asks about each requirement the profile does not show and each role with no numbers', async () => {
    mockGqlRequest.mockResolvedValue({ resumeGaps: gaps });

    renderPanel();

    expect(
      await screen.findByRole('region', { name: 'Strengthen this resume' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Terraform')).toBeInTheDocument();
    expect(screen.getByText('Kafka')).toBeInTheDocument();
    expect(screen.getByLabelText(/Engineer at Acme has no numbers yet/)).toBeInTheDocument();
  });

  it('points to the Overview when the posting has not been read', async () => {
    mockGqlRequest.mockResolvedValue({
      resumeGaps: { ...nothing, requirementsRead: false },
    });

    renderPanel();

    expect(await screen.findByText(/Read the posting’s requirements/)).toBeInTheDocument();
  });

  it('adds a skill on "yes", asks again for what is left, and says it was saved', async () => {
    mockGqlRequest
      .mockResolvedValueOnce({ resumeGaps: gaps })
      .mockResolvedValueOnce({ createSkill: { id: 's1', name: 'Terraform' } })
      .mockResolvedValue({ resumeGaps: { ...gaps, requirementGaps: ['Kafka'] } });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, add Terraform to my skills' }));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('CreateSkill'), {
        input: { name: 'Terraform' },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Saved to your profile');
    await waitFor(() => expect(screen.queryByText('Terraform')).not.toBeInTheDocument());
    expect(mockCapture).toHaveBeenCalledWith('resume_gap_answered', {
      kind: 'requirement',
      answer: 'added',
    });
  });

  it('records a "no" for the application and drops the question', async () => {
    mockGqlRequest
      .mockResolvedValueOnce({ resumeGaps: gaps })
      .mockResolvedValueOnce({ dismissResumeGap: { ...gaps, requirementGaps: ['Terraform'] } });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'No, I have not used Kafka' }));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('DismissResumeGap'), {
        applicationId: 'app-1',
        key: 'Kafka',
      }),
    );
    await waitFor(() => expect(screen.queryByText('Kafka')).not.toBeInTheDocument());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mockCapture).toHaveBeenCalledWith('resume_gap_answered', {
      kind: 'requirement',
      answer: 'dismissed',
    });
  });

  it('appends a result with a number to the role’s description', async () => {
    mockGqlRequest
      .mockResolvedValueOnce({ resumeGaps: gaps })
      .mockResolvedValueOnce({ updateWorkExperience: { id: 'we-1' } })
      .mockResolvedValue({ resumeGaps: { ...gaps, rolesWithoutMetrics: [] } });

    renderPanel();
    fireEvent.change(await screen.findByLabelText(/Engineer at Acme has no numbers yet/), {
      target: { value: 'Led a team of 5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to profile' }));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('UpdateWorkExperience'), {
        id: 'we-1',
        input: { description: 'Ran the platform.\n- Led a team of 5' },
      }),
    );
    expect(mockCapture).toHaveBeenCalledWith('resume_gap_answered', {
      kind: 'metric',
      answer: 'added',
    });
  });

  it('keeps Add to profile off while the line is blank', async () => {
    mockGqlRequest.mockResolvedValue({ resumeGaps: gaps });

    renderPanel();
    const input = await screen.findByLabelText(/Engineer at Acme has no numbers yet/);
    expect(screen.getByRole('button', { name: 'Add to profile' })).toBeDisabled();

    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Add to profile' })).toBeDisabled();
  });

  it('saves once on a double click and clears the field after it saves', async () => {
    mockGqlRequest.mockImplementation((query: string) =>
      Promise.resolve(
        query.includes('UpdateWorkExperience')
          ? { updateWorkExperience: { id: 'we-1' } }
          : { resumeGaps: gaps },
      ),
    );

    renderPanel();
    const input = await screen.findByLabelText(/Engineer at Acme has no numbers yet/);
    fireEvent.change(input, { target: { value: 'Led a team of 5' } });
    const button = screen.getByRole('button', { name: 'Add to profile' });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(input).toHaveValue(''));
    const saves = mockGqlRequest.mock.calls.filter(([q]) =>
      String(q).includes('UpdateWorkExperience'),
    );
    expect(saves).toHaveLength(1);
  });

  it('keeps the typed line and shows the error when the save fails', async () => {
    mockGqlRequest.mockImplementation((query: string) =>
      query.includes('UpdateWorkExperience')
        ? Promise.reject(
            Object.assign(new Error('boom'), {
              response: { errors: [{ message: 'Could not save the role.' }] },
            }),
          )
        : Promise.resolve({ resumeGaps: gaps }),
    );

    renderPanel();
    const input = await screen.findByLabelText(/Engineer at Acme has no numbers yet/);
    fireEvent.change(input, { target: { value: 'Led a team of 5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to profile' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(input).toHaveValue('Led a team of 5');
  });

  it('asks for a figure before saving a result without one', async () => {
    mockGqlRequest.mockResolvedValue({ resumeGaps: gaps });

    renderPanel();
    fireEvent.change(await screen.findByLabelText(/Engineer at Acme has no numbers yet/), {
      target: { value: 'Led the team' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to profile' }));

    expect(await screen.findByText(/Include a number/)).toBeInTheDocument();
    expect(mockGqlRequest).toHaveBeenCalledTimes(1);
  });

  it('skips a role under its own key', async () => {
    mockGqlRequest
      .mockResolvedValueOnce({ resumeGaps: gaps })
      .mockResolvedValueOnce({ dismissResumeGap: { ...gaps, rolesWithoutMetrics: [] } });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Skip Engineer at Acme' }));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('DismissResumeGap'), {
        applicationId: 'app-1',
        key: 'role:we-1',
      }),
    );
  });

  it('shows the API’s message when saving fails', async () => {
    mockGqlRequest.mockResolvedValueOnce({ resumeGaps: gaps }).mockRejectedValueOnce(
      Object.assign(new Error('You have reached the maximum of 100 skills'), {
        response: {
          errors: [
            {
              message: 'You have reached the maximum of 100 skills',
              extensions: { code: 'QUOTA_EXCEEDED' },
            },
          ],
        },
      }),
    );

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, add Terraform to my skills' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('maximum of 100 skills');
  });
});

describe('appendToDescription', () => {
  it('adds the line as its own bullet, or starts the description with it', () => {
    expect(appendToDescription('Ran the platform.\n', '  Led a team of 5 ')).toBe(
      'Ran the platform.\n- Led a team of 5',
    );
    expect(appendToDescription(null, '- Cut costs by 20%')).toBe('- Cut costs by 20%');
  });
});
