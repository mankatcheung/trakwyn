import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreateCertification,
  useDeleteCertification,
  useCertifications,
  useUpdateCertification,
} from '../../hooks/useProfileSections';
import type { Certification, CreateCertificationInput } from '../../types';
import { ProfileEntrySection, type EntryField } from './ProfileEntrySection';

export function CertificationsSection() {
  const { t } = useTranslation('settings');
  const { data: items = [], isLoading } = useCertifications();
  const create = useCreateCertification();
  const update = useUpdateCertification();
  const remove = useDeleteCertification();

  const fields: EntryField[] = [
    { key: 'name', placeholder: t('experience.certificationNamePlaceholder'), required: true },
    { key: 'issuer', placeholder: t('experience.issuerPlaceholder') },
    { key: 'issuedAt', placeholder: t('experience.issuedAtPlaceholder'), date: true },
    { key: 'expiresAt', placeholder: t('experience.expiresAtPlaceholder'), date: true },
    { key: 'credentialUrl', placeholder: t('experience.credentialUrlPlaceholder'), url: true },
  ];

  return (
    <ProfileEntrySection<Certification, CreateCertificationInput>
      testIdPrefix="certification"
      title={t('experience.certificationsTitle')}
      emptyText={t('experience.noCertificationsYet')}
      fields={fields}
      items={items}
      isLoading={isLoading}
      create={create}
      update={update}
      remove={remove}
      rowTitle={(item) => item.name}
      rowMeta={(item) => [item.issuer, item.issuedAt?.slice(0, 10)].filter(Boolean).join(' · ')}
    />
  );
}
