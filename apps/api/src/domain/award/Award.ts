export interface Award {
  id: string;
  userId: string;
  title: string;
  issuer: string | null;
  date: Date | null;
  description: string | null;
  createdAt: Date;
}
