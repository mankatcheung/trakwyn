export interface RegisterInput {
  email: string;
  password: string;
  /** Client IP, for the sign-up rate limit; absent when it can't be determined. */
  ipAddress?: string | null;
}

export interface RegisterOutput {
  userId: string;
  email: string;
}

export interface IRegisterUseCase {
  execute(input: RegisterInput): Promise<RegisterOutput>;
}
