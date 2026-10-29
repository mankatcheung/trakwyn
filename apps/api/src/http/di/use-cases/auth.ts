import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { AssertEmailVerifiedUseCase } from '#src/use-cases/auth/AssertEmailVerifiedUseCase.js';
import { AssertAccountActiveUseCase } from '#src/use-cases/auth/AssertAccountActiveUseCase.js';
import { AuthenticateRequestUseCase } from '#src/use-cases/auth/AuthenticateRequestUseCase.js';
import { AuthenticateMcpRequestUseCase } from '#src/use-cases/auth/AuthenticateMcpRequestUseCase.js';
import { ValidateMcpOAuthAccessTokenUseCase } from '#src/use-cases/mcpOAuth/ValidateMcpOAuthAccessTokenUseCase.js';
import { RegisterUseCase } from '#src/use-cases/auth/RegisterUseCase.js';
import { LoginUseCase } from '#src/use-cases/auth/LoginUseCase.js';
import { LoginWithTotpUseCase } from '#src/use-cases/auth/LoginWithTotpUseCase.js';
import { ReauthenticateUseCase } from '#src/use-cases/auth/ReauthenticateUseCase.js';
import { RequestStepUpCodeUseCase } from '#src/use-cases/auth/RequestStepUpCodeUseCase.js';
import { VerifyStepUpCodeUseCase } from '#src/use-cases/auth/VerifyStepUpCodeUseCase.js';
import { GetStepUpMethodsUseCase } from '#src/use-cases/auth/GetStepUpMethodsUseCase.js';
import { RequestPasswordResetUseCase } from '#src/use-cases/auth/RequestPasswordResetUseCase.js';
import { ResetPasswordUseCase } from '#src/use-cases/auth/ResetPasswordUseCase.js';
import { SendEmailVerificationUseCase } from '#src/use-cases/auth/SendEmailVerificationUseCase.js';
import { VerifyEmailUseCase } from '#src/use-cases/auth/VerifyEmailUseCase.js';
import { RequestBackupEmailRecoveryUseCase } from '#src/use-cases/auth/RequestBackupEmailRecoveryUseCase.js';

import type { Cradle } from '../types.js';

export const auth = {
  authenticateRequestUseCase: asClass(AuthenticateRequestUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  assertEmailVerifiedUseCase: asClass(AssertEmailVerifiedUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  assertAccountActiveUseCase: asClass(AssertAccountActiveUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  authenticateMcpRequestUseCase: asClass(AuthenticateMcpRequestUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  validateMcpOAuthAccessTokenUseCase: asClass(ValidateMcpOAuthAccessTokenUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  registerUseCase: asClass(RegisterUseCase, { lifetime: Lifetime.TRANSIENT }),
  loginUseCase: asClass(LoginUseCase, { lifetime: Lifetime.TRANSIENT }),
  loginWithTotpUseCase: asClass(LoginWithTotpUseCase, { lifetime: Lifetime.TRANSIENT }),
  reauthenticateUseCase: asClass(ReauthenticateUseCase, { lifetime: Lifetime.TRANSIENT }),
  requestStepUpCodeUseCase: asClass(RequestStepUpCodeUseCase, { lifetime: Lifetime.TRANSIENT }),
  verifyStepUpCodeUseCase: asClass(VerifyStepUpCodeUseCase, { lifetime: Lifetime.TRANSIENT }),
  getStepUpMethodsUseCase: asClass(GetStepUpMethodsUseCase, { lifetime: Lifetime.TRANSIENT }),
  requestPasswordResetUseCase: asClass(RequestPasswordResetUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  resetPasswordUseCase: asClass(ResetPasswordUseCase, { lifetime: Lifetime.TRANSIENT }),
  sendEmailVerificationUseCase: asClass(SendEmailVerificationUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  verifyEmailUseCase: asClass(VerifyEmailUseCase, { lifetime: Lifetime.TRANSIENT }),
  requestBackupEmailRecoveryUseCase: asClass(RequestBackupEmailRecoveryUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
} satisfies NameAndRegistrationPair<Cradle>;
