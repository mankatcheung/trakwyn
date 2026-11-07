/** The "or …" rule that separates the OAuth buttons from the email form. */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-gray-200 dark:border-gray-700" />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-white px-2 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {label}
        </span>
      </div>
    </div>
  );
}
