export interface RegisterInput {
  email: string;
  password: string;
  /** Client IP, for the sign-up rate limit; absent when it can't be determined. */
  ipAddress?: string | null;
  captchaToken?: string | null;
  /**
   * Whether this client can show a captcha (JEF-401). A sign-up that cannot
   * is held to a tighter rate limit instead of being let through unchecked.
   */
  enforceCaptcha: boolean;
}

export interface RegisterOutput {
  userId: string;
  email: string;
}

export interface IRegisterUseCase {
  execute(input: RegisterInput): Promise<RegisterOutput>;
}
