import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProfileData } from '#/features/profile/hooks/useProfileData';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('#/graphql/client', () => ({ gqlClient: { request } }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useProfileData(), { wrapper });
}

describe('useProfileData', () => {
  beforeEach(() => request.mockReset());

  it('is loading with empty lists before anything arrives', async () => {
    let release: (value: unknown) => void = () => {};
    request.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { result } = setup();
    expect(result.current).toMatchObject({
      workExperiences: [],
      educations: [],
      skills: [],
      isLoading: true,
      isError: false,
    });
    release({ workExperiences: [], educations: [], skills: [] });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('returns the three lists once loaded', async () => {
    request.mockResolvedValue({
      workExperiences: [{ id: 'w1' }],
      educations: [{ id: 'e1' }, { id: 'e2' }],
      skills: [{ id: 's1' }],
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.workExperiences).toEqual([{ id: 'w1' }]);
    expect(result.current.educations).toEqual([{ id: 'e1' }, { id: 'e2' }]);
    expect(result.current.skills).toEqual([{ id: 's1' }]);
    expect(result.current.isError).toBe(false);
  });

  it('reports an error when any one list fails, and keeps the others', async () => {
    request.mockImplementation(async (doc: unknown) => {
      const text = String(typeof doc === 'string' ? doc : JSON.stringify(doc));
      if (text.includes('Skills')) throw new Error('skills down');
      return { workExperiences: [{ id: 'w1' }], educations: [], skills: [] };
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.workExperiences).toEqual([{ id: 'w1' }]);
    expect(result.current.skills).toEqual([]);
  });
});
