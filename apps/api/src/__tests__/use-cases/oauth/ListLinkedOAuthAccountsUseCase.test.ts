import { describe, it, expect, vi } from 'vitest';
import { ListLinkedOAuthAccountsUseCase } from '#src/use-cases/oauth/ListLinkedOAuthAccountsUseCase.js';
import {
  makeOAuthAccount,
  makeOAuthAccountRepository,
} from '#src/__tests__/helpers/mocks/oauth.js';

describe('ListLinkedOAuthAccountsUseCase', () => {
  it('delegates to the repository and returns the linked accounts', async () => {
    const accounts = [
      makeOAuthAccount({ provider: 'google' }),
      makeOAuthAccount({ provider: 'github' }),
    ];
    const oauthAccountRepository = makeOAuthAccountRepository({
      findAllByUserId: vi.fn().mockResolvedValue(accounts),
    });
    const useCase = new ListLinkedOAuthAccountsUseCase({ oauthAccountRepository });

    const result = await useCase.execute('user-1');

    expect(oauthAccountRepository.findAllByUserId).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(accounts);
  });
});
