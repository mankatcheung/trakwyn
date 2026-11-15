export interface Project {
  id: string;
  userId: string;
  name: string;
  role: string | null;
  url: string | null;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
  createdAt: Date;
}
