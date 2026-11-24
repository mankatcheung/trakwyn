import { Plus, Puzzle } from 'lucide-react';
import { CLIPPER_WEB_STORE_URL } from '#/constants';
import { useLocale } from '#/lib/i18n';

/**
 * Job boards the Clipper reads. Product names, so they are not translated;
 * keep in step with the boards listed in `legal.privacy.clipperBody`.
 */
const SUPPORTED_BOARDS = [
  'LinkedIn',
  'Indeed',
  'Glassdoor',
  'Greenhouse',
  'Lever',
  'Workday',
] as const;

/** Illustrative posting for the preview, like the hero board's sample cards. */
const SAMPLE_POSTING = {
  title: 'Senior Product Designer',
  company: 'Northwind Labs',
  location: 'Remote, Europe · Full-time',
  url: 'careers.northwind.example/jobs/senior-product-designer',
} as const;

const SKELETON_LINES = ['w-[90%]', 'w-[96%]', 'w-3/4', 'w-[88%]', 'w-3/5'] as const;

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-2 dark:border-stone-700 dark:bg-stone-800">
      <div className="text-xs font-medium text-stone-500 dark:text-stone-400">{label}</div>
      <div className="mt-0.5 text-sm text-stone-900 dark:text-stone-100">{value}</div>
    </div>
  );
}

/**
 * A decorative picture of the Clipper saving a posting: a browser window
 * showing a job, with the extension's popup over its corner. Hidden from
 * assistive technology because the copy beside it says the same thing.
 */
function ClipperPreview() {
  const { t } = useLocale();
  return (
    <div className="relative mx-auto w-full max-w-xl pb-28 sm:pb-6" aria-hidden="true">
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-800/50">
        <div className="flex items-center gap-3 border-b border-stone-200 bg-stone-50 px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900/60">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-stone-300 dark:bg-stone-600" />
            <span className="size-2.5 rounded-full bg-stone-300 dark:bg-stone-600" />
            <span className="size-2.5 rounded-full bg-stone-300 dark:bg-stone-600" />
          </div>
          <div className="min-w-0 flex-1 truncate rounded-md border border-stone-200 bg-white px-3 py-1 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
            {SAMPLE_POSTING.url}
          </div>
        </div>
        <div className="flex flex-col gap-3.5 px-6 py-7 sm:min-h-96 sm:pr-72 sm:pl-8">
          <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
            {SAMPLE_POSTING.company}
          </div>
          <div className="text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-100">
            {SAMPLE_POSTING.title}
          </div>
          <div className="text-sm text-stone-600 dark:text-stone-400">
            {SAMPLE_POSTING.location}
          </div>
          <div className="mt-2 flex flex-col gap-3.5">
            {SKELETON_LINES.map((width, i) => (
              <div key={i} className={`h-2 rounded-sm bg-stone-200 dark:bg-stone-700 ${width}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="absolute inset-x-4 bottom-0 flex flex-col gap-3 rounded-2xl border border-stone-300 bg-white p-4 shadow-md sm:inset-x-auto sm:-right-6 sm:w-68 dark:border-stone-600 dark:bg-stone-900">
        <div className="flex items-center gap-2">
          <span className="flex size-5.5 items-center justify-center rounded-md bg-blue-800">
            <Plus className="size-3.5 text-white" strokeWidth={3} />
          </span>
          <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
            {t('landing.clipper.previewHeading')}
          </span>
        </div>
        <PreviewField label={t('landing.clipper.previewJobTitle')} value={SAMPLE_POSTING.title} />
        <PreviewField label={t('landing.clipper.previewCompany')} value={SAMPLE_POSTING.company} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-600 dark:text-stone-400">
            {t('landing.clipper.previewStatus')}
          </span>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
            {t('status.applied')}
          </span>
        </div>
        <div className="rounded-lg bg-blue-800 py-2.5 text-center text-sm font-medium text-white">
          {t('landing.clipper.previewSave')}
        </div>
        <div className="text-center text-xs font-medium text-blue-700 dark:text-blue-400">
          {t('landing.clipper.previewReadWithAi')}
        </div>
      </div>
    </div>
  );
}

/**
 * Landing-page section that tells visitors the Clipper exists and sends them
 * to the Chrome Web Store (JEF-424). The browser is deliberately not
 * detected: the marketing routes server-render, so a client-only check would
 * risk a hydration mismatch. A static note covers other browsers instead.
 *
 * @category Marketing
 */
export function ClipperSection() {
  const { t } = useLocale();
  return (
    <section aria-labelledby="clipper-heading" className="py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
              <Puzzle className="size-5 text-stone-500 dark:text-stone-400" />
            </span>
            <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
              {t('landing.clipper.eyebrow')}
            </span>
          </div>
          <h2
            id="clipper-heading"
            className="mt-5 text-3xl font-medium tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100"
          >
            {t('landing.clipper.title')}
          </h2>
          <p className="mt-4 text-lg/8 text-stone-600 dark:text-stone-400">
            {t('landing.clipper.description')}
          </p>
          <ul aria-label={t('landing.clipper.boardsLabel')} className="mt-6 flex flex-wrap gap-2">
            {SUPPORTED_BOARDS.map((board) => (
              <li
                key={board}
                className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
              >
                {board}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col items-start gap-2.5">
            <a
              href={CLIPPER_WEB_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-900"
            >
              <Plus className="size-4" strokeWidth={2.5} />
              {t('landing.clipper.cta')}
            </a>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {t('landing.clipper.note')}
            </p>
          </div>
        </div>
        <ClipperPreview />
      </div>
    </section>
  );
}
