import { useState, type ComponentType } from 'react';
import type { Draft } from '../../../../lib/cvImportDrafts';

interface GroupProps<T> {
  drafts: Draft<T>[];
  disabled: boolean;
  onChange: (next: Draft<T>[]) => void;
}

/** Holds the drafts in state so an edit in the group is visible in the next render. */
export function Harness<T>({
  Group,
  initial,
  disabled = false,
  onChange,
}: {
  Group: ComponentType<GroupProps<T>>;
  initial: Draft<T>[];
  disabled?: boolean;
  onChange?: (next: Draft<T>[]) => void;
}) {
  const [drafts, setDrafts] = useState(initial);
  return (
    <Group
      drafts={drafts}
      disabled={disabled}
      onChange={(next) => {
        setDrafts(next);
        onChange?.(next);
      }}
    />
  );
}
