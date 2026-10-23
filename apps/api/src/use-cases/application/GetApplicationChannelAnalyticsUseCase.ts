import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { ApplicationStatus } from '#src/domain/application/ApplicationStatus.js';

const NO_SOURCE_LABEL = '(no source)';

const RESPONDED_STATUSES: ApplicationStatus[] = [
  'interviewing',
  'offered',
  'accepted',
  'rejected',
  'withdrawn',
];
const OFFERED_STATUSES: ApplicationStatus[] = ['offered', 'accepted'];

export interface ApplicationGroupStat {
  label: string;
  applicationCount: number;
  respondedCount: number;
  responseRate: number;
  offerCount: number;
  offerRate: number;
}

export interface ApplicationChannelAnalytics {
  bySource: ApplicationGroupStat[];
  byTag: ApplicationGroupStat[];
}

interface Deps {
  entitlementService: IEntitlementService;
  applicationRepository: IApplicationRepository;
}

export interface GetApplicationChannelAnalyticsInput {
  userId: string;
}

interface Group {
  label: string;
  applications: { status: ApplicationStatus }[];
}

function buildStat(group: Group): ApplicationGroupStat {
  const applicationCount = group.applications.length;
  const appliedOrBeyond = group.applications.filter((a) => a.status !== 'draft');
  const respondedCount = appliedOrBeyond.filter((a) =>
    RESPONDED_STATUSES.includes(a.status),
  ).length;
  const offerCount = group.applications.filter((a) => OFFERED_STATUSES.includes(a.status)).length;
  return {
    label: group.label,
    applicationCount,
    respondedCount,
    responseRate:
      appliedOrBeyond.length > 0 ? Math.round((respondedCount / appliedOrBeyond.length) * 100) : 0,
    offerCount,
    offerRate: applicationCount > 0 ? Math.round((offerCount / applicationCount) * 100) : 0,
  };
}

/**
 * Application.source and Application.tags are free text, captured on every
 * application, and until now never aggregated anywhere — this answers
 * "which channel/tag is actually working for me." Grouping is
 * case-insensitive (trim + lowercase) since neither field is normalized at
 * write time; the first-seen casing per group is kept as the display label.
 * Applications with no source are grouped under an explicit "(no source)"
 * bucket rather than dropped, so they aren't silently invisible. Applications
 * with no tags simply don't appear in any tag group — there's no equivalent
 * "(no tag)" bucket, since an application can have zero, one, or many tags
 * and "no tags" isn't a channel the way "no source" is.
 *
 * Response rate mirrors the existing Analytics page's global definition
 * (denominator excludes drafts, numerator is any status past "applied").
 * Offer rate here counts both `offered` and `accepted` — deliberately
 * broader than the global page's "Offer rate" tile, which only counts
 * `accepted` and so under-counts applications that received an offer but
 * haven't recorded a decision yet.
 */
export class GetApplicationChannelAnalyticsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetApplicationChannelAnalyticsInput): Promise<ApplicationChannelAnalytics> {
    await this.deps.entitlementService.assertFeature(input.userId, 'analytics');
    const applications = await this.deps.applicationRepository.findAllByUserId(input.userId);

    const sourceGroups = new Map<string, Group>();
    const tagGroups = new Map<string, Group>();

    for (const application of applications) {
      const trimmedSource = application.source?.trim();
      const sourceLabel = trimmedSource || NO_SOURCE_LABEL;
      const sourceKey = trimmedSource ? trimmedSource.toLowerCase() : NO_SOURCE_LABEL;
      const sourceGroup = sourceGroups.get(sourceKey) ?? { label: sourceLabel, applications: [] };
      sourceGroup.applications.push({ status: application.status });
      sourceGroups.set(sourceKey, sourceGroup);

      for (const tag of application.tags) {
        const tagLabel = tag.trim();
        if (!tagLabel) continue;
        const tagKey = tagLabel.toLowerCase();
        const tagGroup = tagGroups.get(tagKey) ?? { label: tagLabel, applications: [] };
        tagGroup.applications.push({ status: application.status });
        tagGroups.set(tagKey, tagGroup);
      }
    }

    const bySource = Array.from(sourceGroups.values())
      .map(buildStat)
      .sort((a, b) => b.applicationCount - a.applicationCount);
    const byTag = Array.from(tagGroups.values())
      .map(buildStat)
      .sort((a, b) => b.applicationCount - a.applicationCount);

    return { bySource, byTag };
  }
}
