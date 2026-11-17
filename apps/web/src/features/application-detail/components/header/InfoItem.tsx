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
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd
        className={highlight ? 'font-medium text-orange-500' : 'text-gray-700 dark:text-gray-300'}
      >
        {value}
      </dd>
    </div>
  );
}
