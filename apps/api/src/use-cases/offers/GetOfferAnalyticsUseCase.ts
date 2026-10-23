import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import type { IOfferRepository } from '#src/use-cases/ports/IOfferRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { OfferPeriod } from '#src/domain/offer/Offer.js';

export interface OfferTrendPoint {
  offerId: string;
  applicationId: string;
  company: string;
  role: string;
  /** ISO 8601 — pre-serialized here since there's no DateTime scalar in this schema. */
  createdAt: string;
  currency: string;
  normalizedYearlySalary: number;
}

export interface CurrencyGroupStat {
  currency: string;
  count: number;
  minYearlySalary: number;
  maxYearlySalary: number;
  medianYearlySalary: number;
  averageYearlySalary: number;
}

export interface OfferAnalytics {
  trend: OfferTrendPoint[];
  byCurrency: CurrencyGroupStat[];
}

interface Deps {
  entitlementService: IEntitlementService;
  offerRepository: IOfferRepository;
  applicationRepository: IApplicationRepository;
}

export interface GetOfferAnalyticsInput {
  userId: string;
}

function normalizeToYearly(amount: number, period: OfferPeriod): number {
  switch (period) {
    case 'yearly':
      return amount;
    case 'monthly':
      return amount * 12;
    case 'weekly':
      return amount * 52;
    case 'hourly':
      return amount * 2080; // 40 hours/week * 52 weeks
    default:
      return amount;
  }
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Offer is a full domain entity (base salary, bonus, equity, benefits,
 * currency, pay period) captured on every logged offer, and until now
 * there's been zero cross-application view of it — CompareOffersUseCase
 * only compares offers *within* a single application. This surfaces every
 * offer a user has ever logged as a chronological trend, plus min/max/
 * median/average stats.
 *
 * `baseSalary` is normalized to an annualized figure using the same
 * yearly-equivalent conversion CompareOffersUseCase already uses, so
 * offers on different pay periods (hourly/weekly/monthly/yearly) are
 * comparable. `currency` has no ISO-4217 enforcement and this doesn't
 * attempt real FX conversion — offers are grouped by their currency and
 * compared only within that group, rather than silently combining
 * incompatible currencies or dropping non-primary-currency offers.
 */
export class GetOfferAnalyticsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetOfferAnalyticsInput): Promise<OfferAnalytics> {
    await this.deps.entitlementService.assertFeature(input.userId, 'analytics');
    const [offers, applications] = await Promise.all([
      this.deps.offerRepository.findAllByUserId(input.userId),
      this.deps.applicationRepository.findAllByUserId(input.userId),
    ]);

    const applicationById = new Map(applications.map((a) => [a.id, a]));
    const sortedOffers = [...offers].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const trend: OfferTrendPoint[] = [];
    const yearlySalariesByCurrency = new Map<string, number[]>();

    for (const offer of sortedOffers) {
      const application = applicationById.get(offer.applicationId);
      if (!application) continue;

      const normalizedYearlySalary = normalizeToYearly(offer.baseSalary, offer.period);

      trend.push({
        offerId: offer.id,
        applicationId: offer.applicationId,
        company: application.company,
        role: application.role,
        createdAt: offer.createdAt.toISOString(),
        currency: offer.currency,
        normalizedYearlySalary,
      });

      const list = yearlySalariesByCurrency.get(offer.currency) ?? [];
      list.push(normalizedYearlySalary);
      yearlySalariesByCurrency.set(offer.currency, list);
    }

    const byCurrency: CurrencyGroupStat[] = Array.from(yearlySalariesByCurrency.entries())
      .map(([currency, salaries]) => ({
        currency,
        count: salaries.length,
        minYearlySalary: Math.min(...salaries),
        maxYearlySalary: Math.max(...salaries),
        medianYearlySalary: median(salaries),
        averageYearlySalary: average(salaries),
      }))
      .sort((a, b) => b.count - a.count);

    return { trend, byCurrency };
  }
}
