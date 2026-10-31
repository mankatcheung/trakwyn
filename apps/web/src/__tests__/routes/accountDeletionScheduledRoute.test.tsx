import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

const { mockUseEmailVerification } = vi.hoisted(() => ({
  mockUseEmailVerification: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({ hasSessionCookie: () => true, gqlClient: {} }));
vi.mock('#/lib/emailVerification', () => ({
  checkEmailVerification: vi.fn(),
  useEmailVerification: mockUseEmailVerification,
}));
vi.mock('#/routes/-components/AccountDeletionScheduledPage', () => ({
  AccountDeletionScheduledPage: ({ deletionScheduledAt }: { deletionScheduledAt: string }) => (
    <p>scheduled {deletionScheduledAt}</p>
  ),
}));

async function renderRoute() {
  const mod = await import('#/routes/account-deletion-scheduled');
  const route = mod.Route as unknown as {
    options?: { component: () => ReactElement };
    component?: () => ReactElement;
  };
  const Component = (route.options?.component ?? route.component) as () => ReactElement;
  return render(<Component />);
}

describe('/account-deletion-scheduled route (JEF-463)', () => {
  it('passes the scheduled date to the page', async () => {
    mockUseEmailVerification.mockReturnValue({
      data: { deletionScheduledAt: '2026-11-12T12:00:00.000Z' },
    });
    const { container } = await renderRoute();
    expect(container.textContent).toContain('2026-11-12');
  });

  it('renders nothing once cancelling has cleared the date, instead of formatting an empty one', async () => {
    mockUseEmailVerification.mockReturnValue({ data: { deletionScheduledAt: null } });
    const { container } = await renderRoute();
    expect(container).toBeEmptyDOMElement();
  });
});
