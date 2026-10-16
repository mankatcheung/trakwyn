export interface RequestPasswordResetInput {
  email: string;
  ipAddress: string | null;
  captchaToken?: string | null;
  /** Whether this client can show a captcha; the mobile mutation cannot (JEF-401). */
  enforceCaptcha: boolean;
}

export interface IRequestPasswordResetUseCase {
  execute(input: RequestPasswordResetInput): Promise<void>;
}
