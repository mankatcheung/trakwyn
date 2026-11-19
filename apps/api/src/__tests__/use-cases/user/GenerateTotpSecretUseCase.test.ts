import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makePasswordHasher } from '#src/__tests__/helpers/mocks/auth.js';
import { GenerateTotpSecretUseCase } from '#src/use-cases/user/GenerateTotpSecretUseCase.js';
import { makeTotpProvider } from '#src/__tests__/helpers/mocks/auth.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const passwordHasher = makePasswordHasher();

describe('GenerateTotpSecretUseCase', () => {
  const input = { userId: 'user-1', password: 'secret123' };
  const totpProvider = makeTotpProvider();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(passwordHasher.compare).mockResolvedValue(true as never);
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(null) });

    const err = await new GenerateTotpSecretUseCase({
      passwordHasher,
      userRepository,
      totpProvider,
    })
      .execute({ ...input, userId: 'missing' })
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws CONFLICT when 2FA is already enabled', async () => {
    const user = makeUser({ totpEnabled: true });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    const err = await new GenerateTotpSecretUseCase({
      passwordHasher,
      userRepository,
      totpProvider,
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('CONFLICT');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('throws UNAUTHORIZED when the password is wrong', async () => {
    const user = makeUser({ totpEnabled: false });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });
    vi.mocked(passwordHasher.compare).mockResolvedValue(false as never);

    const err = await new GenerateTotpSecretUseCase({
      passwordHasher,
      userRepository,
      totpProvider,
    })
      .execute(input)
      .catch((e) => e);

    expect((err as { code: string }).code).toBe('UNAUTHORIZED');
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('generates a secret, persists it encrypted (not yet enabled), and returns setup data', async () => {
    const user = makeUser({ id: 'user-1', email: 'test@example.com', totpEnabled: false });
    const userRepository = makeUserRepository({ findById: vi.fn().mockResolvedValue(user) });

    const result = await new GenerateTotpSecretUseCase({
      passwordHasher,
      userRepository,
      totpProvider,
    }).execute(input);

    expect(result.secret).toMatch(/^[A-Z2-7]+$/); // base32
    expect(result.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(result.otpauthUrl).toContain(encodeURIComponent(user.email));
    expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(userRepository.update).toHaveBeenCalledWith('user-1', {
      totpSecret: `encrypted:${result.secret}`,
    });
  });
});
