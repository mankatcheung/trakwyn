import { LegalPageLayout } from '#/components/LegalPageLayout';
import { CONTACT_EMAIL } from '#/constants';
import { Link } from '@tanstack/react-router';
import { useLocale } from '#/lib/i18n';

const LAST_UPDATED = 'August 22, 2026';

/**
 * Drafted from what the app actually does, per JEF-202 — not legally
 * reviewed, and "governing law" below is a placeholder that needs a real
 * jurisdiction filled in. See PrivacyPage.tsx for the same caveat in more
 * detail; it applies here too.
 */
export function TermsPage() {
  const { t } = useLocale();
  return (
    <LegalPageLayout titleKey="legal.terms.title" lastUpdated={LAST_UPDATED}>
      <p>{t('legal.terms.intro')}</p>

      <h2>{t('legal.terms.serviceTitle')}</h2>
      <p>{t('legal.terms.serviceBody')}</p>

      <h2>{t('legal.terms.accountTitle')}</h2>
      <ul>
        <li>{t('legal.terms.accountAge')}</li>
        <li>{t('legal.terms.accountAccuracy')}</li>
        <li>{t('legal.terms.accountSecurity')}</li>
      </ul>

      <h2>{t('legal.terms.contentTitle')}</h2>
      <p>
        {t('legal.terms.contentBodyPrefix')} <Link to="/privacy">{t('legal.privacy.title')}</Link>.
      </p>
      <p>{t('legal.terms.contentByokBody')}</p>

      <h2>{t('legal.terms.acceptableTitle')}</h2>
      <p>{t('legal.terms.acceptableIntro')}</p>
      <ul>
        <li>{t('legal.terms.acceptableLawful')}</li>
        <li>{t('legal.terms.acceptableAccess')}</li>
        <li>{t('legal.terms.acceptableScrape')}</li>
        <li>{t('legal.terms.acceptableMalicious')}</li>
      </ul>

      <h2>{t('legal.terms.terminationTitle')}</h2>
      <p>{t('legal.terms.terminationBody')}</p>

      <h2>{t('legal.terms.disclaimersTitle')}</h2>
      <p>{t('legal.terms.disclaimersBody')}</p>

      <h2>{t('legal.terms.liabilityTitle')}</h2>
      <p>{t('legal.terms.liabilityBody')}</p>

      <h2>{t('legal.terms.changesTitle')}</h2>
      <p>{t('legal.terms.changesBody')}</p>

      {/*
        No "Governing law" section: it needs a real jurisdiction (where
        Trakwyn is operated from/incorporated), which isn't something to
        guess at. Add one — "These terms are governed by the laws of
        [X], without regard to its conflict-of-law principles." — once
        that's confirmed. Omitting it is safer than a rendered placeholder
        a real visitor (or Google's review) could see.
      */}

      <h2>{t('legal.terms.contactTitle')}</h2>
      <p>
        {t('legal.terms.contactPrefix')} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPageLayout>
  );
}
