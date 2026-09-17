import { LegalPageLayout } from '#/components/LegalPageLayout';
import { CONTACT_EMAIL } from '#/constants';
import { useLocale } from '#/lib/i18n';

const LAST_UPDATED = 'August 22, 2026';

/**
 * Drafted from what the app actually collects and does, per JEF-202 — not
 * legally reviewed. Needs a founder/counsel pass before being treated as
 * authoritative, but reads as a complete policy rather than a stub: that's
 * what Google's OAuth consent-screen requirement (a working Privacy Policy
 * URL) and a real user landing on this page both need.
 */
export function PrivacyPage() {
  const { t } = useLocale();
  return (
    <LegalPageLayout titleKey="legal.privacy.title" lastUpdated={LAST_UPDATED}>
      <p>{t('legal.privacy.intro')}</p>

      <h2>{t('legal.privacy.collectTitle')}</h2>

      <h3>{t('legal.privacy.accountTitle')}</h3>
      <p>{t('legal.privacy.accountBody')}</p>
      <p>{t('legal.privacy.oauthBody')}</p>

      <h3>{t('legal.privacy.jobDataTitle')}</h3>
      <p>{t('legal.privacy.jobDataBody')}</p>

      <h3>{t('legal.privacy.securityInfoTitle')}</h3>
      <p>{t('legal.privacy.securityInfoBody')}</p>

      <h3>{t('legal.privacy.aiTitle')}</h3>
      <p>{t('legal.privacy.aiBody')}</p>

      <h3>{t('legal.privacy.cookiesTitle')}</h3>
      <p>{t('legal.privacy.cookiesBody')}</p>

      <h2>{t('legal.privacy.useTitle')}</h2>
      <ul>
        <li>{t('legal.privacy.useOperate')}</li>
        <li>{t('legal.privacy.useSecure')}</li>
        <li>{t('legal.privacy.useEmail')}</li>
        <li>{t('legal.privacy.useImprove')}</li>
      </ul>

      <h2>{t('legal.privacy.shareTitle')}</h2>
      <p>{t('legal.privacy.shareIntro')}</p>
      <ul>
        <li>
          <strong>{t('legal.privacy.shareProvidersStrong')}</strong>{' '}
          {t('legal.privacy.shareProvidersRest')}
        </li>
        <li>
          <strong>{t('legal.privacy.shareLawStrong')}</strong> {t('legal.privacy.shareLawRest')}
        </li>
      </ul>

      <h2>{t('legal.privacy.controlTitle')}</h2>
      <p>{t('legal.privacy.controlBody')}</p>

      <h2>{t('legal.privacy.dataSecurityTitle')}</h2>
      <p>{t('legal.privacy.dataSecurityBody')}</p>

      <h2>{t('legal.privacy.childrenTitle')}</h2>
      <p>{t('legal.privacy.childrenBody')}</p>

      <h2>{t('legal.privacy.changesTitle')}</h2>
      <p>{t('legal.privacy.changesBody')}</p>

      <h2>{t('legal.privacy.contactTitle')}</h2>
      <p>
        {t('legal.privacy.contactPrefix')} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPageLayout>
  );
}
