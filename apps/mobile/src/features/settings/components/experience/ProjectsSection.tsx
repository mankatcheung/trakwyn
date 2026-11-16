import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from '../../hooks/useProfileSections';
import type { Project, CreateProjectInput } from '../../types';
import { dateRange } from './dateRange';
import { ProfileEntrySection, type EntryField } from './ProfileEntrySection';

export function ProjectsSection() {
  const { t } = useTranslation('settings');
  const { data: items = [], isLoading } = useProjects();
  const create = useCreateProject();
  const update = useUpdateProject();
  const remove = useDeleteProject();

  const fields: EntryField[] = [
    { key: 'name', placeholder: t('experience.projectNamePlaceholder'), required: true },
    { key: 'role', placeholder: t('experience.projectRolePlaceholder') },
    { key: 'url', placeholder: t('experience.projectUrlPlaceholder'), url: true },
    { key: 'startDate', placeholder: t('experience.startDatePlaceholder'), date: true },
    { key: 'endDate', placeholder: t('experience.endDatePlaceholder'), date: true },
    { key: 'description', placeholder: t('experience.descriptionPlaceholder'), multiline: true },
  ];

  return (
    <ProfileEntrySection<Project, CreateProjectInput>
      testIdPrefix="project"
      title={t('experience.projectsTitle')}
      emptyText={t('experience.noProjectsYet')}
      fields={fields}
      items={items}
      isLoading={isLoading}
      create={create}
      update={update}
      remove={remove}
      rowTitle={(item) => item.name}
      rowMeta={(item) =>
        [item.role, item.startDate ? dateRange(item.startDate, item.endDate) : null]
          .filter(Boolean)
          .join(' · ')
      }
    />
  );
}
