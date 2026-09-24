import { LegalPageLayout } from '#/components/LegalPageLayout';
import { CONTACT_EMAIL } from '#/constants';
import { useLocale } from '#/lib/i18n';

const LAST_UPDATED = 'August 23, 2026';

/**
 * Not a compliance claim — Trakwyn hasn't had a full manual accessibility
 * audit. This states what's actually true today: a target standard, and
 * what's actually been done toward it, per JEF-132.
 */
export function AccessibilityPage() {
  const { t } = useLocale();
  return (
    <LegalPageLayout titleKey="legal.accessibility.title" lastUpdated={LAST_UPDATED}>
      <p>{t('legal.accessibility.intro')}</p>

      <h2>{t('legal.accessibility.targetTitle')}</h2>
      <p>
        {t('legal.accessibility.targetBodyPrefix')}{' '}
        <a href="https://www.w3.org/WAI/WCAG21/quickref/" target="_blank" rel="noreferrer">
          {t('legal.accessibility.wcagLinkText')}
        </a>{' '}
        {t('legal.accessibility.targetBodySuffix')}
      </p>

      <h2>{t('legal.accessibility.doneTitle')}</h2>
      <ul>
        <li>{t('legal.accessibility.scansLi')}</li>
        <li>{t('legal.accessibility.fixedLi')}</li>
      </ul>

      <h2>{t('legal.accessibility.limitationsTitle')}</h2>
      <p>{t('legal.accessibility.limitationsBody')}</p>

      <h2>{t('legal.accessibility.contactTitle')}</h2>
      <p>
        {t('legal.accessibility.contactPrefix')}{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPageLayout>
  );
}
