import type { ReactNode } from 'react';
import { LogoMark } from '#/components/LogoMark';

/** The centred, signed-out-looking card the account deletion pages share (JEF-463). */
export function AccountDeletionLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8 dark:bg-gray-900">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2">
          <LogoMark size={28} />
          <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Trakwyn</span>
        </div>
        <div className="space-y-5 rounded-xl bg-white p-8 shadow-sm dark:bg-gray-800">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
