import { Link } from '@tanstack/react-router';
import { useLocale } from '#/lib/i18n';
import {
  AI_LIMIT_REACHED_CODE,
  AI_NOT_CONFIGURED_CODE,
  PLAN_REQUIRED_CODE,
} from '#/lib/graphqlError';

export interface AiErrorMessageProps {
  /** The GraphQL `extensions.code`, or a `ChatStreamError`'s own `code`. */
  code: string | undefined;
  /** Shown for anything this doesn't have specific copy for. */
  fallback: string;
}

/**
 * The two AI failures a user can act on, told apart and pointed somewhere.
 *
 * Both send the reader to Settings → AI, but for opposite reasons, so the
 * copy has to differ: "no key configured" means add one, while "limit
 * reached" means they have a key and need to raise its ceiling — telling
 * them to add a key they already have would be the wrong instruction
 * (JEF-258).
 *
 * Renders inline content only, no wrapper: each call site keeps whatever
 * paragraph and tone classes it already had. It replaced three byte-identical
 * copies of the not-configured branch across the AI tabs, which is why the
 * new case only had to be written once.
 */
export function AiErrorMessage({ code, fallback }: AiErrorMessageProps) {
  const { t } = useLocale();

  if (code === AI_LIMIT_REACHED_CODE) {
    return (
      <>
        {t('ai.limitReachedPrefix')}{' '}
        <Link to="/settings/ai" className="underline">
          {t('resumeMatch.accountSettingsLinkText')}
        </Link>{' '}
        {t('ai.limitReachedSuffix')}
      </>
    );
  }

  // The Free plan's monthly AI allowance (or a Pro-only AI feature). The API's
  // message already says which, so it is shown as it came, with the way out.
  if (code === PLAN_REQUIRED_CODE) {
    return (
      <>
        {fallback}{' '}
        <Link to="/settings/plan" className="underline">
          {t('plan.seePlans')}
        </Link>
      </>
    );
  }

  if (code === AI_NOT_CONFIGURED_CODE) {
    return (
      <>
        {t('resumeMatch.addApiKeyPrefix')}{' '}
        <Link to="/settings/ai" className="underline">
          {t('resumeMatch.accountSettingsLinkText')}
        </Link>{' '}
        {t('resumeMatch.addApiKeySuffix')}
      </>
    );
  }

  return <>{fallback}</>;
}
