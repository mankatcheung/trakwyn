import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CoverLetterGenerator } from '../components/CoverLetterGenerator';
import { DocumentCategoryScreen } from './DocumentCategoryScreen';

/** Every cover letter for the application — drafts and uploads — plus AI generation. */
export function CoverLettersScreen() {
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  return (
    <DocumentCategoryScreen
      category="cover_letter"
      header={<CoverLetterGenerator applicationId={applicationId} />}
    />
  );
}
