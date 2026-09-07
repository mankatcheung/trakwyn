import React from 'react';
import { Stack } from 'expo-router';
import type { TFunction } from 'i18next';

// The application-detail subtree (detail, edit, notes, documents, offers,
// compare) is intentionally duplicated as physical route files under each of
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
      options={{ title: t('screenTitles.editApplication') }}
    />,
    <Stack.Screen
      key="notes"
      name={`${prefix}[id]/notes`}
      options={{ title: t('screenTitles.notes') }}
    />,
    <Stack.Screen
      key="documents"
      name={`${prefix}[id]/documents`}
      options={{ title: t('screenTitles.documents') }}
    />,
    <Stack.Screen
      key="offers"
      name={`${prefix}[id]/offers/index`}
      options={{ title: t('screenTitles.offers') }}
    />,
    <Stack.Screen
      key="compareOffers"
      name={`${prefix}[id]/offers/compare`}
      options={{ title: t('screenTitles.compareOffers') }}
    />,
  ];
}
