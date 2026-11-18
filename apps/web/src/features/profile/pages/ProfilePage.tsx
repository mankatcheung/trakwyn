import { useState } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  AwardIcon,
  BriefcaseIcon,
  GraduationCapIcon,
  LanguagesIcon,
  RocketIcon,
  TrophyIcon,
  UploadIcon,
  WrenchIcon,
} from 'lucide-react';
import { Button, Card, Skeleton } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { sameOriginPath } from '#/features/auth/lib/returnTo';
import { CvImportDialog } from '../components/cv-import/CvImportDialog';
import {
  WORK_EXPERIENCE_SECTION_ID,
  WorkExperienceSection,
} from '../components/sections/WorkExperienceSection';
import { EDUCATION_SECTION_ID, EducationSection } from '../components/sections/EducationSection';
import { SKILLS_SECTION_ID, SkillsSection } from '../components/sections/SkillsSection';
import {
  CERTIFICATIONS_SECTION_ID,
  CertificationsSection,
} from '../components/sections/CertificationsSection';
import { LANGUAGES_SECTION_ID, LanguagesSection } from '../components/sections/LanguagesSection';
import { PROJECTS_SECTION_ID, ProjectsSection } from '../components/sections/ProjectsSection';
import { AWARDS_SECTION_ID, AwardsSection } from '../components/sections/AwardsSection';
import { CompletenessMeter } from '../components/CompletenessMeter';
import { profileCompleteness } from '../lib/profileCompleteness';
import { useProfileData } from '../hooks/useProfileData';

const route = getRouteApi('/_authenticated/profile/');

const SECTION_LINKS = [
  {
    id: WORK_EXPERIENCE_SECTION_ID,
    labelKey: 'experience.workExperienceTitle',
    icon: BriefcaseIcon,
  },
  { id: EDUCATION_SECTION_ID, labelKey: 'experience.educationTitle', icon: GraduationCapIcon },
  { id: PROJECTS_SECTION_ID, labelKey: 'experience.projectsTitle', icon: RocketIcon },
  { id: SKILLS_SECTION_ID, labelKey: 'experience.skillsTitle', icon: WrenchIcon },
  {
    id: CERTIFICATIONS_SECTION_ID,
    labelKey: 'experience.certificationsTitle',
    icon: AwardIcon,
  },
  { id: AWARDS_SECTION_ID, labelKey: 'experience.awardsTitle', icon: TrophyIcon },
  { id: LANGUAGES_SECTION_ID, labelKey: 'experience.languagesTitle', icon: LanguagesIcon },
] as const;

export function ProfilePage() {
  const { t } = useLocale();
  const profile = useProfileData();
  const [importOpen, setImportOpen] = useState(false);
  const navigate = useNavigate();
  const returnTo = sameOriginPath(route.useSearch().returnTo);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      {returnTo && (
        <Button variant="link" className="mb-4" onClick={() => void navigate({ href: returnTo })}>
          <span className="flex items-center gap-1.5">
            <ArrowLeftIcon size={14} /> {t('profile.returnToBack')}
          </span>
        </Button>
      )}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('profile.title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
            {t('profile.description')}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setImportOpen(true)}>
          <span className="flex items-center gap-2">
            <UploadIcon size={15} /> {t('cvImport.button')}
          </span>
        </Button>
      </header>
      <CvImportDialog open={importOpen} onClose={() => setImportOpen(false)} />

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[14rem_1fr] lg:items-start lg:gap-8">
        <aside className="space-y-4 lg:sticky lg:top-8">
          <Card className="p-4">
            {profile.isLoading ? (
              <Skeleton className="h-14 rounded-lg" />
            ) : (
              <CompletenessMeter completeness={profileCompleteness(profile)} />
            )}
          </Card>
          <nav aria-label={t('profile.sectionsNavLabel')}>
            <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
              {SECTION_LINKS.map(({ id, labelKey, icon: Icon }) => (
                <li key={id} className="shrink-0">
                  <a
                    href={`#${id}`}
                    className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 lg:rounded-lg lg:border-transparent dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100 lg:dark:border-transparent"
                  >
                    <Icon size={15} />
                    {t(labelKey)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="min-w-0 space-y-6">
          <WorkExperienceSection />
          <EducationSection />
          <ProjectsSection />
          <SkillsSection />
          <CertificationsSection />
          <AwardsSection />
          <LanguagesSection />
        </div>
      </div>
    </div>
  );
}
