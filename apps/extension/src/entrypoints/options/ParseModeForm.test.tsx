import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { render, type Rendered } from '../../__tests__/render';
import { ParseModeForm } from './ParseModeForm';
import { getParseMode, setParseMode } from '../../lib/storage';

let rendered: Rendered | undefined;

beforeEach(() => fakeBrowser.reset());
afterEach(() => {
  rendered?.unmount();
  rendered = undefined;
});

function radio(value: string) {
  return rendered!.container.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
}

describe('ParseModeForm', () => {
  it('defaults to the built-in parser', async () => {
    rendered = await render(<ParseModeForm />);

    expect(radio('builtin').checked).toBe(true);
    expect(radio('ai').checked).toBe(false);
  });

  it('loads a saved choice', async () => {
    await setParseMode('ai');

    rendered = await render(<ParseModeForm />);

    expect(radio('ai').checked).toBe(true);
  });

  it('persists the choice as soon as it is made', async () => {
    rendered = await render(<ParseModeForm />);

    await act(async () => radio('ai').click());

    expect(radio('ai').checked).toBe(true);
    await expect(getParseMode()).resolves.toBe('ai');
  });

  it('says that AI sends the page text to the provider', async () => {
    rendered = await render(<ParseModeForm />);

    expect(rendered.container.textContent).toContain("page's text to your AI provider");
  });
});
