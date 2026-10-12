import React from 'react';
import { DocumentCategoryScreen } from './DocumentCategoryScreen';

/**
 * Every cover letter for the application — drafts and uploads. Generating one
 * happens on the create screen, as it does for resumes (JEF-396).
 */
export function CoverLettersScreen() {
  return <DocumentCategoryScreen category="cover_letter" />;
}
