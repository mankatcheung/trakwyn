import type { User } from '#src/domain/user/User.js';

export type LoginInput = {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  captchaToken?: string | null;
  /**
   * Whether this client can show a captcha (JEF-401). When false the captcha
   * is never asked for, and only the attempt ceiling applies.
   */
  enforceCaptcha: boolean;
};

export type LoginOutput = User;

export interface ILoginUseCase {
  execute(input: LoginInput): Promise<LoginOutput>;
}
