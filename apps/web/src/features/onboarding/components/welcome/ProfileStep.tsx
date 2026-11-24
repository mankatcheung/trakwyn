import { Link } from '@tanstack/react-router';
import { useLocale } from '#/lib/i18n';
import { WorkExperienceSection } from '../../../profile/components/sections/WorkExperienceSection';
import { SkillsSection } from '../../../profile/components/sections/SkillsSection';

/**
 * The quick profile step, for AI goals only. It is the profile page's own
 * sections, so whatever is added here is on `/profile` and is what resumes,
 * cover letters and the assistant are written from.
 */
export function ProfileStep() {
  const { t } = useLocale();
  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-700 dark:text-stone-300">
        {t('welcome.profileHint')}{' '}
        <Link
          to="/profile"
          className="font-medium text-blue-800 dark:text-blue-400 hover:underline"
        >
          {t('welcome.profileFullLink')}
        </Link>
      </p>
      <WorkExperienceSection />
      <SkillsSection />
    </div>
  );
}
