export interface Certification {
  id: string;
  userId: string;
  name: string;
  issuer: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  credentialUrl: string | null;
  createdAt: Date;
}
