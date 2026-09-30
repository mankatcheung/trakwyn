import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, type Rendered } from '../../__tests__/render';
import { UserHeader } from './UserHeader';
import type { CurrentUser } from '../../lib/api';

const baseUser: CurrentUser = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatarUrl: 'https://blob.example.com/avatar.png',
};

let rendered: Rendered | undefined;

async function renderHeader(user: CurrentUser, onSignOut = vi.fn()) {
  rendered = await render(<UserHeader user={user} onSignOut={onSignOut} />);
  return rendered.container;
}

afterEach(() => {
  rendered?.unmount();
  rendered = undefined;
});

describe('UserHeader', () => {
  it('shows the avatar, name and email', async () => {
    const el = await renderHeader(baseUser);

    expect(el.querySelector('img.user-avatar')?.getAttribute('src')).toBe(baseUser.avatarUrl);
    expect(el.querySelector('.user-name')?.textContent).toBe('Ada Lovelace');
    expect(el.querySelector('.user-email')?.textContent).toBe('ada@example.com');
  });

  it('shows initials when there is no avatar', async () => {
    const el = await renderHeader({ ...baseUser, avatarUrl: null });

    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.user-initials')?.textContent).toBe('AL');
  });

  it('falls back to initials when the avatar fails to load', async () => {
    const el = await renderHeader(baseUser);

    act(() => {
      el.querySelector('img.user-avatar')!.dispatchEvent(new Event('error'));
    });

    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.user-initials')?.textContent).toBe('AL');
  });

  it('leads with the email, shown once, when the user has no name', async () => {
    const el = await renderHeader({ ...baseUser, name: null, avatarUrl: null });

    expect(el.querySelector('.user-name')?.textContent).toBe('ada@example.com');
    expect(el.querySelector('.user-email')).toBeNull();
    expect(el.querySelector('.user-initials')?.textContent).toBe('A');
  });

  it('calls onSignOut from the Sign out button', async () => {
    const onSignOut = vi.fn();
    const el = await renderHeader(baseUser, onSignOut);

    act(() => {
      el.querySelector<HTMLButtonElement>('button.logout')!.click();
    });

    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
