import { useState } from 'react';
import { useLocale } from '#/lib/i18n';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';

export type HealthScoreCriterion = {
  key: string;
  label: string;
  points: number;
  earned: number;
  met: boolean;
};
export type HealthScore = { score: number; label: string; criteria: HealthScoreCriterion[] };

export const SCORE_COLORS = {
  green: {
    ring: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-900/20',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    bar: 'bg-green-500',
  },
  blue: {
    ring: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    bar: 'bg-blue-500',
  },
  amber: {
    ring: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  red: {
    ring: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-900/20',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    bar: 'bg-red-500',
  },
} as const;

export function scoreColor(score: number): keyof typeof SCORE_COLORS {
  if (score >= 91) return 'green';
  if (score >= 71) return 'blue';
  if (score >= 41) return 'amber';
  return 'red';
}

export function HealthScorePanel({ healthScore }: { healthScore: HealthScore }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const color = SCORE_COLORS[scoreColor(healthScore.score)];

  return (
    <div className="mt-4 rounded-xl border border-gray-100 p-3 dark:border-gray-700">
      {/*
        One line: the label, the verdict, and a bar. The 52px progress ring and
        stacked heading it replaced cost four times the height to say the same
        number, and on a phone that height came straight out of the sections
        below (JEF-208). The criteria breakdown is still one tap away.
      */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3"
      >
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300">
              {t('healthScore.applicationHealth')}
            </span>
            <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-300">
              {healthScore.label} · {healthScore.score}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <div
              className={`h-full rounded-full ${color.bar}`}
              style={{ width: `${healthScore.score}%` }}
            />
          </div>
        </div>
        {open ? (
          <ChevronUpIcon size={16} className="shrink-0 text-gray-400" />
        ) : (
          <ChevronDownIcon size={16} className="shrink-0 text-gray-400" />
        )}
      </button>

      {open && (
        <ul className="mt-3 space-y-1.5">
          {healthScore.criteria.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded-full ${c.met ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`}
                >
                  {c.met && <CheckIcon size={10} className="text-white" />}
                </span>
                <span className={c.met ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'}>
                  {c.label}
                </span>
              </div>
              <span
                className={`shrink-0 font-medium ${c.met ? 'text-gray-600 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'}`}
              >
                +{c.points}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
