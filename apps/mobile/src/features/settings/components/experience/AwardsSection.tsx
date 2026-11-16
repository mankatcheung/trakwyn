import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreateAward,
  useDeleteAward,
  useAwards,
  useUpdateAward,
} from '../../hooks/useProfileSections';
import type { Award, CreateAwardInput } from '../../types';
import { ProfileEntrySection, type EntryField } from './ProfileEntrySection';

export function AwardsSection() {
  const { t } = useTranslation('settings');
  const { data: items = [], isLoading } = useAwards();
  const create = useCreateAward();
  const update = useUpdateAward();
  const remove = useDeleteAward();

  const fields: EntryField[] = [
    { key: 'title', placeholder: t('experience.awardTitlePlaceholder'), required: true },
    { key: 'issuer', placeholder: t('experience.issuerPlaceholder') },
    { key: 'date', placeholder: t('experience.awardDatePlaceholder'), date: true },
    { key: 'description', placeholder: t('experience.descriptionPlaceholder'), multiline: true },
  ];

  return (
    <ProfileEntrySection<Award, CreateAwardInput>
      testIdPrefix="award"
      title={t('experience.awardsTitle')}
      emptyText={t('experience.noAwardsYet')}
      fields={fields}
      items={items}
      isLoading={isLoading}
      create={create}
      update={update}
      remove={remove}
      rowTitle={(item) => item.title}
      rowMeta={(item) => [item.issuer, item.date?.slice(0, 10)].filter(Boolean).join(' · ')}
    />
  );
}
