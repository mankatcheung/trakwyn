import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { gqlClient } from '#/graphql/client';
import { getGqlErrorCode, AI_NOT_CONFIGURED_CODE } from '#/lib/graphqlError';
import { useLocale } from '#/lib/i18n';
import { AiCreditCost } from '#/components/ai/AiCreditCost';
import { useAiCredits } from '#/components/ai/hooks/useAiCredits';
import { AiCreditsMeter } from '#/components/AiCreditsMeter';
import { SparklesIcon } from 'lucide-react';
import { Button, Input, Textarea } from '@trakwyn/ui';

const PARSE_JD_MUTATION = `
  mutation ParseJobDescription($text: String, $url: String) {
    parseJobDescription(text: $text, url: $url) {
      company role location salary description
    }
  }
`;

type ParsedJd = {
  company: string | null;
  role: string | null;
  location: string | null;
  salary: string | null;
  description: string | null;
};

interface Props {
  onFill: (data: ParsedJd) => void;
}

export function JdImportPanel({ onFill }: Props) {
  const { t } = useLocale();
  const { onTrakwynAi } = useAiCredits();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'text' | 'url'>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiNotConfigured, setAiNotConfigured] = useState(false);
  const [filled, setFilled] = useState(false);

  const handleAutoFill = async () => {
    setError(null);
    setAiNotConfigured(false);
    setFilled(false);
    setLoading(true);
    try {
      const vars = mode === 'text' ? { text } : { url };
      const data = await gqlClient.request<{ parseJobDescription: ParsedJd }>(
        PARSE_JD_MUTATION,
        vars,
      );
      onFill(data.parseJobDescription);
      setFilled(true);
      setTimeout(() => setOpen(false), 800);
    } catch (err) {
      if (getGqlErrorCode(err) === AI_NOT_CONFIGURED_CODE) {
        setAiNotConfigured(true);
      } else {
        setError(err instanceof Error ? err.message : t('jdImport.parseFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const tabClass = (active: boolean) =>
    active
      ? 'px-3 py-1.5 text-xs font-medium rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
      : 'px-3 py-1.5 text-xs font-medium rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors';

  return (
    <div className="overflow-hidden rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <SparklesIcon size={15} className="shrink-0 text-blue-500" />
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
          {t('jdImport.autoFillTitle')}
        </span>
        <span className="ml-auto text-xs text-blue-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-blue-200 px-4 pt-3 pb-4 dark:border-blue-800">
          <div className="flex w-fit gap-1 rounded-lg bg-blue-100 p-1 dark:bg-blue-900/40">
            <button
              type="button"
              className={tabClass(mode === 'text')}
              onClick={() => setMode('text')}
            >
              {t('jdImport.pasteText')}
            </button>
            <button
              type="button"
              className={tabClass(mode === 'url')}
              onClick={() => setMode('url')}
            >
              {t('jdImport.fromUrl')}
            </button>
          </div>

          {mode === 'text' ? (
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={t('jdImport.pastePlaceholder')}
            />
          ) : (
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://company.com/jobs/..."
            />
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {aiNotConfigured && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {t('resumeMatch.addApiKeyPrefix')}{' '}
              <Link to="/settings/ai" className="underline">
                {t('resumeMatch.accountSettingsLinkText')}
              </Link>{' '}
              {t('resumeMatch.addApiKeySuffix')}
            </p>
          )}

          <Button
            onClick={handleAutoFill}
            disabled={loading || (mode === 'text' ? !text.trim() : !url.trim())}
          >
            <span className="flex items-center gap-2">
              <SparklesIcon size={13} />
              {loading
                ? t('jdImport.parsing')
                : filled
                  ? t('jdImport.filled')
                  : t('jdImport.autoFillFields')}
            </span>
          </Button>
          <AiCreditCost feature="parseJobDescription" />
          {onTrakwynAi && <AiCreditsMeter variant="inline" />}
          <p className="text-xs text-blue-500 dark:text-blue-400">{t('jdImport.prefilledNote')}</p>
        </div>
      )}
    </div>
  );
}
