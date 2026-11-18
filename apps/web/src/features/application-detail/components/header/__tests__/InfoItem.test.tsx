import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InfoItem } from '#/features/application-detail/components/header/InfoItem';

describe('InfoItem', () => {
  it('pairs the label with its value', () => {
    render(
      <dl>
        <InfoItem label="Location" value="Berlin" />
      </dl>,
    );

    expect(screen.getByText('Location').tagName).toBe('DT');
    const value = screen.getByText('Berlin');
    expect(value.tagName).toBe('DD');
    expect(value).not.toHaveClass('text-orange-500');
  });

  it('follows its props when they change', () => {
    const { rerender } = render(
      <dl>
        <InfoItem label="Location" value="Berlin" />
      </dl>,
    );

    rerender(
      <dl>
        <InfoItem label="Location" value="Berlin" />
      </dl>,
    );
    expect(screen.getByText('Berlin')).toBeInTheDocument();

    rerender(
      <dl>
        <InfoItem label="City" value="Paris" highlight />
      </dl>,
    );
    expect(screen.getByText('City')).toBeInTheDocument();
    expect(screen.getByText('Paris')).toHaveClass('text-orange-500');
    expect(screen.queryByText('Berlin')).not.toBeInTheDocument();
  });

  it('highlights the value when asked', () => {
    render(
      <dl>
        <InfoItem label="Follow-up" value="Tomorrow" highlight />
      </dl>,
    );

    expect(screen.getByText('Tomorrow')).toHaveClass('text-orange-500');
  });
});
