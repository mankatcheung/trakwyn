import React from 'react';
import { DocumentCategoryScreen } from './DocumentCategoryScreen';

/** Everything that is neither a resume nor a cover letter. Upload-only: it has no drafts. */
export function OtherDocumentsScreen() {
  return <DocumentCategoryScreen category="other" />;
}
