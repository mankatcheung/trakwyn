import { builder } from '#src/http/schema/builder.js';
import { PlanEnum, PlanSourceEnum } from '#src/http/schema/types/enums/PlanEnums.js';
import { AI_CREDITS } from '#src/use-cases/constants.js';
import type { AiCreditStanding } from '#src/use-cases/ports/IAiCreditService.js';
import type { BillingStatus, PlanTerms } from '#src/use-cases/plans/GetBillingStatusUseCase.js';

type PlanFeatures = BillingStatus['features'];
type PlanLimits = BillingStatus['limits'];
type PlanUsage = BillingStatus['usage'];

const PlanFeaturesRef = builder.objectRef<PlanFeatures>('PlanFeatures');
PlanFeaturesRef.implement({
  description: 'The Pro-only capabilities, on or off for this user.',
  fields: (t) => ({
    notifications: t.exposeBoolean('notifications'),
    analytics: t.exposeBoolean('analytics'),
    offers: t.exposeBoolean('offers'),
    shareLinks: t.exposeBoolean('shareLinks'),
    apiAccess: t.exposeBoolean('apiAccess', {
      description: 'The GraphQL API with an API token. MCP access is `mcpAccess`.',
    }),
    mcpAccess: t.exposeBoolean('mcpAccess'),
  }),
});

interface AiCreditCost {
  feature: string;
  credits: number;
}

const AiCreditCostRef = builder.objectRef<AiCreditCost>('AiCreditCost');
AiCreditCostRef.implement({
  description: 'What one hosted AI action costs, in credits.',
  fields: (t) => ({
    feature: t.exposeString('feature', { nullable: false }),
    credits: t.exposeInt('credits', { nullable: false }),
  }),
});

/** Every feature's weight, from `AI_CREDITS.WEIGHTS` so the table is stated once. */
const AI_CREDIT_COSTS: readonly AiCreditCost[] = Object.entries(AI_CREDITS.WEIGHTS).map(
  ([feature, credits]) => ({ feature, credits }),
);

export const AiCreditsRef = builder.objectRef<AiCreditStanding>('AiCredits');
AiCreditsRef.implement({
  description: "This month's hosted AI credits. Calls on the user's own key are never counted.",
  fields: (t) => ({
    used: t.exposeInt('used'),
    limit: t.exposeInt('limit', {
      description: "The plan's monthly size, without the welcome bonus.",
    }),
    bonusRemaining: t.exposeInt('bonusRemaining', {
      description: 'Welcome-bonus credits still unspent; 0 after the first 14 days.',
    }),
    resetsAt: t.field({ type: 'String', resolve: (credits) => credits.resetsAt.toISOString() }),
    costs: t.field({
      type: [AiCreditCostRef],
      nullable: false,
      description: 'What each AI action costs in credits (the same on every plan).',
      resolve: () => [...AI_CREDIT_COSTS],
    }),
  }),
});

const PlanLimitsRef = builder.objectRef<PlanLimits>('PlanLimits');
PlanLimitsRef.implement({
  description: 'What the user may hold. Null means no limit.',
  fields: (t) => ({
    applications: t.exposeInt('applications', { nullable: true }),
    documentBytes: t.exposeFloat('documentBytes'),
    aiCreditsPerMonth: t.exposeInt('aiCreditsPerMonth'),
  }),
});

const PlanUsageRef = builder.objectRef<PlanUsage>('PlanUsage');
PlanUsageRef.implement({
  description: 'How much of each limit the user has used.',
  fields: (t) => ({
    applications: t.exposeInt('applications'),
    documentBytes: t.exposeFloat('documentBytes'),
  }),
});

const PlanTermsRef = builder.objectRef<PlanTerms>('PlanTerms');
PlanTermsRef.implement({
  description: 'What one plan includes.',
  fields: (t) => ({
    features: t.field({ type: PlanFeaturesRef, resolve: (terms) => terms.features }),
    limits: t.field({ type: PlanLimitsRef, resolve: (terms) => terms.limits }),
  }),
});

const PlanCatalogueRef = builder.objectRef<BillingStatus['catalogue']>('PlanCatalogue');
PlanCatalogueRef.implement({
  description: 'Both plans side by side, whichever one the user is on.',
  fields: (t) => ({
    free: t.field({ type: PlanTermsRef, resolve: (catalogue) => catalogue.free }),
    pro: t.field({ type: PlanTermsRef, resolve: (catalogue) => catalogue.pro }),
  }),
});

export const BillingStatusRef = builder.objectRef<BillingStatus>('BillingStatus');
BillingStatusRef.implement({
  fields: (t) => ({
    enforced: t.exposeBoolean('enforced', {
      description: 'False when this instance does not enforce plans: every feature is then on.',
    }),
    plan: t.field({ type: PlanEnum, resolve: (status) => status.plan }),
    planExpiresAt: t.field({
      type: 'String',
      nullable: true,
      resolve: (status) => status.planExpiresAt?.toISOString() ?? null,
    }),
    planSource: t.field({
      type: PlanSourceEnum,
      nullable: true,
      resolve: (status) => status.planSource,
    }),
    features: t.field({ type: PlanFeaturesRef, resolve: (status) => status.features }),
    limits: t.field({ type: PlanLimitsRef, resolve: (status) => status.limits }),
    catalogue: t.field({ type: PlanCatalogueRef, resolve: (status) => status.catalogue }),
    usage: t.field({ type: PlanUsageRef, resolve: (status) => status.usage }),
    aiCredits: t.field({ type: AiCreditsRef, resolve: (status) => status.aiCredits }),
  }),
});
