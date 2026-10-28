import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { LoginOrSignupWithOAuthUseCase } from '#src/use-cases/oauth/LoginOrSignupWithOAuthUseCase.js';
import { LinkOAuthAccountUseCase } from '#src/use-cases/oauth/LinkOAuthAccountUseCase.js';
import { UnlinkOAuthAccountUseCase } from '#src/use-cases/oauth/UnlinkOAuthAccountUseCase.js';
import { ListLinkedOAuthAccountsUseCase } from '#src/use-cases/oauth/ListLinkedOAuthAccountsUseCase.js';
import { ExchangeMobileOAuthCodeUseCase } from '#src/use-cases/oauth/ExchangeMobileOAuthCodeUseCase.js';
import { ReauthenticateWithOAuthUseCase } from '#src/use-cases/oauth/ReauthenticateWithOAuthUseCase.js';

import type { Cradle } from '../types.js';

export const oauth = {
  loginOrSignupWithOAuthUseCase: asClass(LoginOrSignupWithOAuthUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  linkOAuthAccountUseCase: asClass(LinkOAuthAccountUseCase, { lifetime: Lifetime.TRANSIENT }),
  unlinkOAuthAccountUseCase: asClass(UnlinkOAuthAccountUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  listLinkedOAuthAccountsUseCase: asClass(ListLinkedOAuthAccountsUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  exchangeMobileOAuthCodeUseCase: asClass(ExchangeMobileOAuthCodeUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  reauthenticateWithOAuthUseCase: asClass(ReauthenticateWithOAuthUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
} satisfies NameAndRegistrationPair<Cradle>;
