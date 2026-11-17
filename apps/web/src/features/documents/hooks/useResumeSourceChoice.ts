import { useState } from 'react';

export const FILE_PREFIX = 'file:';
export const DRAFT_PREFIX = 'draft:';

export interface ResumeSourceIds {
  resumeDocumentId: string | null;
  resumeDraftId: string | null;
}

/** The picker's value ("file:<id>" or "draft:<id>") as the ids the API takes. */
export function resumeSourceIds(choice: string): ResumeSourceIds {
  return {
    resumeDocumentId: choice.startsWith(FILE_PREFIX) ? choice.slice(FILE_PREFIX.length) : null,
    resumeDraftId: choice.startsWith(DRAFT_PREFIX) ? choice.slice(DRAFT_PREFIX.length) : null,
  };
}

/** State for the picker, so a panel can hold the choice without knowing its encoding. */
export function useResumeSourceChoice() {
  const [choice, setChoice] = useState('');
  return { choice, setChoice, ids: resumeSourceIds(choice) };
}
