import { describe, it, expect } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { useForm } from 'react-hook-form';
import {
  POSTING_TEXT_MAX_CHARS,
  PostingTextField,
} from '#/features/applications/components/new/PostingTextField';

interface Values {
  postingText: string;
}

let latest = '';

function Harness({ error, defaultValue = '' }: { error?: string; defaultValue?: string }) {
  const { register, watch } = useForm<Values>({ defaultValues: { postingText: defaultValue } });
  // Read through the registered field itself, not the compiler-incompatible watch(),
  // by letting the test see what the DOM holds.
  latest = watch('postingText');
  return (
    <form>
      <PostingTextField registration={register('postingText')} error={error} />
    </form>
  );
}

const field = () => screen.getByRole('textbox', { name: 'Full job posting' });

describe('PostingTextField', () => {
  it('labels the field and describes it with the hint', () => {
    render(<Harness />);

    expect(field()).toHaveAttribute('aria-describedby', 'posting-text-hint');
    expect(screen.getByText(/Used to tailor your resume/)).toHaveAttribute(
      'id',
      'posting-text-hint',
    );
    expect(field()).toHaveAttribute(
      'placeholder',
      'Paste the whole posting, or use Auto-fill above',
    );
  });

  it('holds as much as the API accepts', () => {
    render(<Harness />);

    expect(field()).toHaveAttribute('maxlength', String(POSTING_TEXT_MAX_CHARS));
    expect(POSTING_TEXT_MAX_CHARS).toBe(15_000);
  });

  it('starts from the value it is given and passes typing to the form', () => {
    render(<Harness defaultValue="Existing posting" />);
    expect(field()).toHaveValue('Existing posting');

    fireEvent.change(field(), { target: { value: 'Pasted posting' } });

    expect(latest).toBe('Pasted posting');
  });

  it('shows no error until there is one', () => {
    render(<Harness />);

    expect(field()).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Too long')).not.toBeInTheDocument();
  });

  it('shows the error and marks the field invalid', () => {
    render(<Harness error="Too long" />);

    expect(screen.getByText('Too long')).toBeInTheDocument();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
  });

  it('relabels itself when the language changes', async () => {
    render(<Harness />);
    i18next.addResourceBundle('en-GB', 'translation', {
      'applicationForm.postingTextLabel': 'Whole job advert',
    });

    await act(async () => {
      await i18next.changeLanguage('en-GB');
    });
    expect(screen.getByRole('textbox', { name: 'Whole job advert' })).toBeInTheDocument();

    await act(async () => {
      await i18next.changeLanguage('en');
    });
    expect(field()).toBeInTheDocument();
  });

  it('follows the error as it appears and clears', () => {
    const { rerender } = render(<Harness />);

    rerender(<Harness error="Too long" />);
    expect(screen.getByText('Too long')).toBeInTheDocument();

    rerender(<Harness />);
    expect(screen.queryByText('Too long')).not.toBeInTheDocument();
  });
});
