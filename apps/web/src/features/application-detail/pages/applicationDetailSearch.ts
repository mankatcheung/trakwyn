import { z } from 'zod';
import { resolveLegacySection, SECTION_IDS } from '#/features/application-detail/lib/sections';

/** The application detail route's search params, validated for the route and the tests. */
/** Unknown or absent falls back to Notes rather than erroring the route. */
export const sectionSearchSchema = z.object({
  section: z.preprocess(resolveLegacySection, z.enum(SECTION_IDS).optional()),
});
