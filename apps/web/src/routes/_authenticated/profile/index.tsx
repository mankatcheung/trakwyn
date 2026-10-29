import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  BriefcaseIcon,
  GraduationCapIcon,
  UploadIcon,
  WrenchIcon,
} from 'lucide-react';
import { z } from 'zod';
import { Button, Card, Skeleton } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { sameOriginPath } from '#/lib/returnTo';
import { CvImportDialog } from './-components/CvImportDialog';
import {
  WORK_EXPERIENCE_SECTION_ID,
  WorkExperienceSection,
} from './-components/WorkExperienceSection';
import { EDUCATION_SECTION_ID, EducationSection } from './-components/EducationSection';
import { SKILLS_SECTION_ID, SkillsSection } from './-components/SkillsSection';
import { CompletenessMeter } from './-components/CompletenessMeter';
import { profileCompleteness } from './-components/profileCompleteness';
import { useProfileData } from './-components/useProfileData';

const searchSchema = z.object({
  /**
   * Where to go back to once the profile is filled in, e.g. the cover-letter
   * form that sent the user here (JEF-460). Checked again with
   * `sameOriginPath` before it is used, so an off-site value shows no link.
   */
  returnTo: z.string().optional(),
});

export const Route = createFileRoute('/_authenticated/profile/')({
  validateSearch: searchSchema,
  component: ProfilePage,
});

const SECTION_LINKS = [
  {
    id: WORK_EXPERIENCE_SECTION_ID,
    labelKey: 'experience.workExperienceTitle',
    icon: BriefcaseIcon,
  },
  { id: EDUCATION_SECTION_ID, labelKey: 'experience.educationTitle', icon: GraduationCapIcon },
  { id: SKILLS_SECTION_ID, labelKey: 'experience.skillsTitle', icon: WrenchIcon },
] as const;

function ProfilePage() {
  const { t } = useLocale();
  const profile = useProfileData();
  const [importOpen, setImportOpen] = useState(false);
  const navigate = useNavigate();
  const returnTo = sameOriginPath(Route.useSearch().returnTo);

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
          <SkillsSection />
        </div>
      </div>
    </div>
  );
}
