import React from 'react';
import { Stack } from 'expo-router';
import type { TFunction } from 'i18next';

// The application-detail subtree (detail, edit, notes, documents, offers)
// is intentionally duplicated as physical route files under each of
// the Home, Applications, and Calendar tabs (JEF-291), so every tab keeps its
// own independent stack. `prefix` locates that subtree relative to the
// calling layout's own folder — empty for the Applications tab (where
// `[id]/*` sits directly at its root) and `"applications/"` for Home and
// Calendar (where the detail screens are nested under an `applications/`
// subfolder next to that tab's own root screen).
export function applicationDetailStackScreens(t: TFunction<'navigation'>, prefix: string) {
  return [
    <Stack.Screen
      key="detail"
      name={`${prefix}[id]/index`}
      options={{ title: t('screenTitles.application') }}
    />,
    <Stack.Screen
      key="edit"
      name={`${prefix}[id]/edit`}
      options={{ title: t('screenTitles.editApplication'), presentation: 'modal' }}
    />,
    <Stack.Screen
      key="notes"
      name={`${prefix}[id]/notes`}
      options={{ title: t('screenTitles.notes') }}
    />,
    <Stack.Screen
      key="interviews"
      name={`${prefix}[id]/interviews`}
      options={{ title: t('screenTitles.interviews') }}
    />,
    <Stack.Screen
      key="contacts"
      name={`${prefix}[id]/contacts`}
      options={{ title: t('screenTitles.contacts') }}
    />,
    <Stack.Screen
      key="activity"
      name={`${prefix}[id]/activity`}
      options={{ title: t('screenTitles.activity') }}
    />,
    <Stack.Screen
      key="documents"
      name={`${prefix}[id]/documents/index`}
      options={{ title: t('screenTitles.documents') }}
    />,
    <Stack.Screen
      key="newDraft"
      name={`${prefix}[id]/documents/new`}
      options={{ title: t('screenTitles.newDraft'), presentation: 'modal' }}
    />,
    <Stack.Screen
      key="draft"
      name={`${prefix}[id]/documents/[draftId]`}
      options={{ title: t('screenTitles.draft'), presentation: 'modal' }}
    />,
    <Stack.Screen
      key="coverLetter"
      name={`${prefix}[id]/cover-letter`}
      options={{ title: t('screenTitles.coverLetter') }}
    />,
    <Stack.Screen
      key="resumeMatch"
      name={`${prefix}[id]/resume-match`}
      options={{ title: t('screenTitles.resumeMatch') }}
    />,
    <Stack.Screen
      key="companyBriefing"
      name={`${prefix}[id]/company-briefing`}
      options={{ title: t('screenTitles.companyBriefing') }}
    />,
    <Stack.Screen
      key="offers"
      name={`${prefix}[id]/offers/index`}
      options={{ title: t('screenTitles.offers') }}
    />,
  ];
}
