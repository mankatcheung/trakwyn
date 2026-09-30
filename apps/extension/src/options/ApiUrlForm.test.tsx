import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, type Rendered } from '../__tests__/render';
import { ApiUrlForm } from './ApiUrlForm';
import { clearAuth, setApiUrl } from '../lib/storage';

vi.mock('../lib/storage', () => ({
  getApiUrl: vi.fn(async () => 'http://localhost:3001/graphql'),
  setApiUrl: vi.fn(),
  clearAuth: vi.fn(),
}));

let rendered: Rendered | undefined;

afterEach(() => {
  rendered?.unmount();
  rendered = undefined;
  vi.clearAllMocks();
});

async function submitWith(value: string) {
  rendered = await render(<ApiUrlForm />);
  const input = rendered.container.querySelector<HTMLInputElement>('#api-url')!;
  // React tracks the input's value, so set it through the native setter
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    rendered!.container.querySelector('form')!.requestSubmit();
  });
  return rendered.container;
}

describe('ApiUrlForm', () => {
  it('loads the current API URL', async () => {
    rendered = await render(<ApiUrlForm />);

    expect(rendered.container.querySelector<HTMLInputElement>('#api-url')!.value).toBe(
      'http://localhost:3001/graphql',
    );
  });

  it('saves a new URL and drops the token issued by the old API', async () => {
    const el = await submitWith('https://api.trakwyn.com/graphql');

    expect(setApiUrl).toHaveBeenCalledWith('https://api.trakwyn.com/graphql');
    expect(clearAuth).toHaveBeenCalledOnce();
    expect(el.textContent).toContain('Saved.');
  });

  it('keeps the session when the URL is unchanged', async () => {
    await submitWith('http://localhost:3001/graphql');

    expect(setApiUrl).toHaveBeenCalledOnce();
    expect(clearAuth).not.toHaveBeenCalled();
  });

  it('rejects anything that is not an http(s) URL', async () => {
    const el = await submitWith('javascript:alert(1)');

    expect(setApiUrl).not.toHaveBeenCalled();
    expect(el.querySelector('.error-box')).not.toBeNull();
  });
});
