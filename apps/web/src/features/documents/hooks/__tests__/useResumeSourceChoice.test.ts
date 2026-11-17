import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  resumeSourceIds,
  useResumeSourceChoice,
} from '#/features/documents/hooks/useResumeSourceChoice';

describe('resumeSourceIds', () => {
  it('decodes a file choice', () => {
    expect(resumeSourceIds('file:d1')).toEqual({ resumeDocumentId: 'd1', resumeDraftId: null });
  });

  it('decodes a draft choice', () => {
    expect(resumeSourceIds('draft:r1')).toEqual({ resumeDocumentId: null, resumeDraftId: 'r1' });
  });

  it('returns no ids for the empty choice', () => {
    expect(resumeSourceIds('')).toEqual({ resumeDocumentId: null, resumeDraftId: null });
  });
});

describe('useResumeSourceChoice', () => {
  it('starts empty and derives ids from the chosen value', () => {
    const { result } = renderHook(() => useResumeSourceChoice());
    expect(result.current.choice).toBe('');
    expect(result.current.ids.resumeDraftId).toBeNull();

    act(() => result.current.setChoice('draft:r9'));

    expect(result.current.choice).toBe('draft:r9');
    expect(result.current.ids).toEqual({ resumeDocumentId: null, resumeDraftId: 'r9' });
  });
});
