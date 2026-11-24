/** The "or …" rule that separates the OAuth buttons from the email form. */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-stone-200 dark:border-stone-700" />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-white px-2 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
          {label}
        </span>
      </div>
    </div>
  );
}
