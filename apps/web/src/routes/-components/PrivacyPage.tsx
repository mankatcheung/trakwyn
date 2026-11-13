import { LegalPageLayout } from '#/components/LegalPageLayout';
import { CONTACT_EMAIL } from '#/constants';
import { useLocale } from '#/lib/i18n';

const LAST_UPDATED = 'November 11, 2026';

/**
 * AI sub-processors behind Trakwyn AI (JEF-452, JEF-453). Hosted AI runs on
 * Cloudflare Workers AI through AI Gateway, so Cloudflare is the only one; no
 * content goes to Google or OpenAI (a user's own key is a separate path, below).
 * Names are not translated. Every claim made about these flows is mapped to the
 * code that makes it true in docs/ai-data-handling.md (JEF-549); the
 * architecture test aiDataHandling.test.ts fails when one of them drifts.
 */
const AI_SUBPROCESSORS = [
  {
    name: 'Cloudflare (Workers AI and AI Gateway)',
    purposeKey: 'legal.privacy.aiCloudflarePurpose',
    /** The Self-Serve Subscription Agreement, which governs a paid self-serve account. */
    href: 'https://www.cloudflare.com/terms/',
    /** Cloudflare's statement on training, retention and logging for Workers AI content. */
    dataUseHref: 'https://developers.cloudflare.com/workers-ai/platform/data-usage/',
  },
] as const;

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

      <h3>{t('legal.privacy.aiHostedTitle')}</h3>
      <p>{t('legal.privacy.aiHostedBody')}</p>
      <p>{t('legal.privacy.aiHostedSentBody')}</p>
      <p>{t('legal.privacy.aiHostedNoTrainingBody')}</p>
      <p>{t('legal.privacy.aiHostedRetentionBody')}</p>
      <table>
        <caption className="sr-only">{t('legal.privacy.aiTableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('legal.privacy.aiColVendor')}</th>
            <th scope="col">{t('legal.privacy.aiColPurpose')}</th>
            <th scope="col">{t('legal.privacy.aiColRegion')}</th>
            <th scope="col">{t('legal.privacy.aiColTerms')}</th>
          </tr>
        </thead>
        <tbody>
          {AI_SUBPROCESSORS.map((vendor) => (
            <tr key={vendor.name}>
              <th scope="row">{vendor.name}</th>
              <td>{t(vendor.purposeKey)}</td>
              <td>{t('legal.privacy.aiRegion')}</td>
              <td>
                <a href={vendor.href} target="_blank" rel="noopener noreferrer">
                  {t('legal.privacy.aiTermsLink')}
                </a>
                {' · '}
                <a href={vendor.dataUseHref} target="_blank" rel="noopener noreferrer">
                  {t('legal.privacy.aiDataUseLink')}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>{t('legal.privacy.aiUsageAnalyticsBody')}</p>

      <h3>{t('legal.privacy.webSearchTitle')}</h3>
      <p>{t('legal.privacy.webSearchBody')}</p>

      <h3>{t('legal.privacy.clipperTitle')}</h3>
      <p>{t('legal.privacy.clipperBody')}</p>
      <p>{t('legal.privacy.clipperAiBody')}</p>
      <p>{t('legal.privacy.clipperTokensBody')}</p>
      <p>{t('legal.privacy.clipperErrorsBody')}</p>

      <h3>{t('legal.privacy.paymentsTitle')}</h3>
      <p>{t('legal.privacy.paymentsBody')}</p>
      <p>{t('legal.privacy.paymentsRetentionBody')}</p>

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
