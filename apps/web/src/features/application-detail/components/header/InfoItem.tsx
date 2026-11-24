export function InfoItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-stone-400">{label}</dt>
      <dd
        className={highlight ? 'font-medium text-orange-500' : 'text-stone-700 dark:text-stone-300'}
      >
        {value}
      </dd>
    </div>
  );
}
