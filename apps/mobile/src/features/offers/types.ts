export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'HKD', 'TWD', 'CNY'];
export const PERIODS = ['yearly', 'monthly', 'weekly', 'hourly'] as const;

export type OfferPeriod = (typeof PERIODS)[number];

export interface Offer {
  id: string;
  applicationId: string;
  baseSalary: number;
  bonus: number | null;
  equity: string | null;
  benefits: string | null;
  costOfLivingAdjustment: number | null;
  currency: string;
  period: OfferPeriod;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OfferFormData {
  baseSalary: number;
  bonus: number | null;
  equity: string;
  benefits: string;
  costOfLivingAdjustment: number | null;
  currency: string;
  period: OfferPeriod;
  notes: string;
}

export interface OfferWithApplication {
  company: string;
  role: string;
  offer: Offer;
}

export interface OfferComparison {
  offer: Offer;
  company: string;
  role: string;
  normalizedYearlySalary: number;
  totalCompensation: number;
}
