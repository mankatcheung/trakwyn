import { useEffect, useState } from 'react';

/** Seconds left until a deadline, ticking once a second only while there are any. */
export function useCooldown() {
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const start = (forSeconds: number) => {
    const started = Date.now();
    setNow(started);
    setEndsAt(started + forSeconds * 1000);
  };
  return [seconds, start] as const;
}
