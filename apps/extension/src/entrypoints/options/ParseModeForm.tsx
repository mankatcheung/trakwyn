import { useEffect, useState } from 'react';
import { getParseMode, setParseMode } from '../../lib/storage';
import { DEFAULT_PARSE_MODE, type ParseMode } from '../../constants';

const CHOICES: ReadonlyArray<{ mode: ParseMode; label: string; hint: string }> = [
  {
    mode: 'builtin',
    label: 'Built-in parser',
    hint: 'Reads the page in your browser. Nothing leaves it until you save.',
  },
  {
    mode: 'ai',
    label: 'AI',
    hint: "Sends the page's text to your AI provider, using the key in your Trakwyn settings.",
  },
];

/** How the Clipper reads a posting (JEF-420). Saved as soon as it is chosen. */
export function ParseModeForm() {
  const [mode, setMode] = useState<ParseMode>(DEFAULT_PARSE_MODE);

  useEffect(() => {
    getParseMode().then(setMode);
  }, []);

  async function choose(next: ParseMode) {
    setMode(next);
    await setParseMode(next);
  }

  return (
    <fieldset className="container form">
      <legend>How should the Clipper read a posting?</legend>
      {CHOICES.map(({ mode: value, label, hint }) => (
        <div className="field" key={value}>
          <label>
            <input
              type="radio"
              name="parse-mode"
              value={value}
              checked={mode === value}
              onChange={() => choose(value)}
            />{' '}
            {label}
          </label>
          <p className="muted">{hint}</p>
        </div>
      ))}
    </fieldset>
  );
}
