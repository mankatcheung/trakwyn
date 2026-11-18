import { fireEvent, screen } from '@testing-library/react';
import type { Draft } from '../../../../lib/cvImportDrafts';

export function draft<T>(value: T, over: Partial<Draft<T>> = {}): Draft<T> {
  return {
    id: `d-${Math.random().toString(36).slice(2)}`,
    selected: true,
    alreadyInProfile: false,
    value,
    ...over,
  };
}

export const edit = () => fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

export const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

export const isInvalid = (el: HTMLElement) => el.getAttribute('aria-invalid') === 'true';
