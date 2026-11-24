import type { SeedApplication } from '../../types.js';
import { draftApplications } from './draft.js';
import { appliedApplications } from './applied.js';
import { interviewingApplications } from './interviewing.js';
import { offeredApplications } from './offered.js';
import { rejectedApplications } from './rejected.js';
import { withdrawnApplications } from './withdrawn.js';
import { quotaDemoApplications } from './quotaDemo.js';

/** The quota demo rows (JEF-494) are for developers, so a profile can leave them out. */
export const buildApplications = (includeQuotaDemo = true): SeedApplication[] => [
  ...draftApplications,
  ...appliedApplications,
  ...interviewingApplications,
  ...offeredApplications,
  ...rejectedApplications,
  ...withdrawnApplications,
  ...(includeQuotaDemo ? quotaDemoApplications : []),
];
