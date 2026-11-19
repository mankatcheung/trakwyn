import { describe, expect, it, vi } from 'vitest';
import { RegisterMcpOAuthClientUseCase } from '#src/use-cases/mcpOAuth/RegisterMcpOAuthClientUseCase.js';

describe('RegisterMcpOAuthClientUseCase', () => {
  it('registers an MCP client with exact redirect URIs', async () => {
    const repository = {
      create: vi.fn().mockImplementation(async (data) => data),
    } as { create: ReturnType<typeof vi.fn> };
    const useCase = new RegisterMcpOAuthClientUseCase({
      mcpOAuthClientRepository: repository as never,
    });

    const result = await useCase.execute({
      name: 'Claude Desktop',
      redirectUris: [
        'http://localhost:6274/oauth/callback',
        'http://localhost:6274/oauth/callback',
      ],
    });

    expect(result.id).toMatch(/^trakwyn_mcp_client_[a-f0-9]{32}$/);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Claude Desktop',
        redirectUris: ['http://localhost:6274/oauth/callback'],
      }),
    );
  });

  it('rejects non-HTTPS redirect URIs except loopback HTTP', async () => {
    const useCase = new RegisterMcpOAuthClientUseCase({
      mcpOAuthClientRepository: { create: vi.fn() } as never,
    });

    await expect(
      useCase.execute({ name: 'Bad client', redirectUris: ['http://evil.example/callback'] }),
    ).rejects.toThrow('redirect_uris');
  });
});
