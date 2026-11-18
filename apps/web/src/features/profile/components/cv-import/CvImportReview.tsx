import { Alert } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import type { CvDrafts } from '../../lib/cvImportDrafts';
import {
  AwardsReviewGroup,
  CertificationsReviewGroup,
  LanguagesReviewGroup,
  SkillsReviewGroup,
} from './review/CredentialReviewGroups';
import {
  EducationReviewGroup,
  ProjectsReviewGroup,
  WorkReviewGroup,
} from './review/ExperienceReviewGroups';

/**
 * The CV import's review step (JEF-461): what the API read, as rows to untick
 * and edit. Nothing here is saved; `CvImportDialog` sends the ticked rows.
 */

interface CvImportReviewProps {
  drafts: CvDrafts;
  onChange: (next: CvDrafts) => void;
  truncated: boolean;
  disabled: boolean;
}

export function CvImportReview({ drafts, onChange, truncated, disabled }: CvImportReviewProps) {
  const { t } = useLocale();
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600 dark:text-gray-300">{t('cvImport.reviewIntro')}</p>
      {truncated && <Alert role="status">{t('cvImport.truncated')}</Alert>}

      <WorkReviewGroup
        drafts={drafts.workExperiences}
        disabled={disabled}
        onChange={(workExperiences) => onChange({ ...drafts, workExperiences })}
      />
      <EducationReviewGroup
        drafts={drafts.educations}
        disabled={disabled}
        onChange={(educations) => onChange({ ...drafts, educations })}
      />
      <ProjectsReviewGroup
        drafts={drafts.projects}
        disabled={disabled}
        onChange={(projects) => onChange({ ...drafts, projects })}
      />
      <SkillsReviewGroup
        drafts={drafts.skills}
        disabled={disabled}
        onChange={(skills) => onChange({ ...drafts, skills })}
      />
      <CertificationsReviewGroup
        drafts={drafts.certifications}
        disabled={disabled}
        onChange={(certifications) => onChange({ ...drafts, certifications })}
      />
      <AwardsReviewGroup
        drafts={drafts.awards}
        disabled={disabled}
        onChange={(awards) => onChange({ ...drafts, awards })}
      />
      <LanguagesReviewGroup
        drafts={drafts.languages}
        disabled={disabled}
        onChange={(languages) => onChange({ ...drafts, languages })}
      />
    </div>
  );
}
