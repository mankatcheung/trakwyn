import { describe, it, expect, vi } from 'vitest';
import { RecordCookieConsentUseCase } from '#src/use-cases/cookieConsent/RecordCookieConsentUseCase.js';
import { makeCookieConsentRepository } from '#src/__tests__/helpers/mocks/cookieConsent.js';

describe('RecordCookieConsentUseCase', () => {
  it('persists the decision with a generated id', async () => {
    const cookieConsentRepository = makeCookieConsentRepository({
      create: vi.fn().mockResolvedValue({
        id: 'consent-1',
        analyticsAccepted: true,
        ipAddress: '203.0.113.5',
        userAgent: 'Mozilla/5.0',
        consentedAt: new Date(),
      }),
    });
    const useCase = new RecordCookieConsentUseCase({
      cookieConsentRepository,
      generateId: () => 'consent-1',
    });

    await useCase.execute({
      analyticsAccepted: true,
      ipAddress: '203.0.113.5',
      userAgent: 'Mozilla/5.0',
    });

    expect(cookieConsentRepository.create).toHaveBeenCalledWith({
      id: 'consent-1',
      analyticsAccepted: true,
      ipAddress: '203.0.113.5',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('persists a rejection with null ip/user-agent unchanged', async () => {
    const cookieConsentRepository = makeCookieConsentRepository();
    const useCase = new RecordCookieConsentUseCase({
      cookieConsentRepository,
      generateId: () => 'consent-2',
    });

    await useCase.execute({ analyticsAccepted: false, ipAddress: null, userAgent: null });

    expect(cookieConsentRepository.create).toHaveBeenCalledWith({
      id: 'consent-2',
      analyticsAccepted: false,
      ipAddress: null,
      userAgent: null,
    });
  });
});
