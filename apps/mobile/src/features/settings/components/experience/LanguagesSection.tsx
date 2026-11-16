import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreateLanguage,
  useDeleteLanguage,
  useLanguages,
  useUpdateLanguage,
} from '../../hooks/useProfileSections';
import type { Language, CreateLanguageInput } from '../../types';
import { ProfileEntrySection, type EntryField } from './ProfileEntrySection';

export function LanguagesSection() {
  const { t } = useTranslation('settings');
  const { data: items = [], isLoading } = useLanguages();
  const create = useCreateLanguage();
  const update = useUpdateLanguage();
  const remove = useDeleteLanguage();

  const fields: EntryField[] = [
    { key: 'name', placeholder: t('experience.languageNamePlaceholder'), required: true },
    { key: 'proficiency', placeholder: t('experience.proficiencyPlaceholder') },
  ];

  return (
    <ProfileEntrySection<Language, CreateLanguageInput>
      testIdPrefix="language"
      title={t('experience.languagesTitle')}
      emptyText={t('experience.noLanguagesYet')}
      fields={fields}
      items={items}
      isLoading={isLoading}
      create={create}
      update={update}
      remove={remove}
      rowTitle={(item) => item.name}
      rowMeta={(item) => item.proficiency ?? ''}
    />
  );
}
