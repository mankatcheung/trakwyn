import { describe, it, expect } from 'vitest';
import { deriveSaveState, hasUnsavedWork } from '#/lib/editor/saveState';

const flags = { dirty: false, saving: false, failed: false };

describe('deriveSaveState (JEF-577)', () => {
  it('is saved when nothing is pending', () => {
    expect(deriveSaveState(flags)).toBe('saved');
  });
  it('is dirty while an edit waits for its save', () => {
    expect(deriveSaveState({ ...flags, dirty: true })).toBe('dirty');
  });
  it('is saving while a save is in flight, even with newer typing or an old failure', () => {
    expect(deriveSaveState({ dirty: true, saving: true, failed: true })).toBe('saving');
  });
  it('is error after a failed save', () => {
    expect(deriveSaveState({ ...flags, failed: true })).toBe('error');
  });
  it('shows fresh typing over an old failure', () => {
    expect(deriveSaveState({ ...flags, dirty: true, failed: true })).toBe('dirty');
  });
});

describe('hasUnsavedWork', () => {
  it('only a saved document may be left without asking', () => {
    expect(hasUnsavedWork('saved')).toBe(false);
    expect(hasUnsavedWork('dirty')).toBe(true);
    expect(hasUnsavedWork('saving')).toBe(true);
    expect(hasUnsavedWork('error')).toBe(true);
  });
});
