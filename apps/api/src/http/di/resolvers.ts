import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { AuthResolver } from '#src/interface-adapters/resolvers/AuthResolver.js';
import { ApplicationResolver } from '#src/interface-adapters/resolvers/ApplicationResolver.js';
import { NoteResolver } from '#src/interface-adapters/resolvers/NoteResolver.js';
import { DocumentResolver } from '#src/interface-adapters/resolvers/DocumentResolver.js';
import { DocumentDraftResolver } from '#src/interface-adapters/resolvers/DocumentDraftResolver.js';
import { CompanyBriefingResolver } from '#src/interface-adapters/resolvers/CompanyBriefingResolver.js';
import { UserResolver } from '#src/interface-adapters/resolvers/UserResolver.js';
import { InterviewRoundResolver } from '#src/interface-adapters/resolvers/InterviewRoundResolver.js';
import { ActivityLogResolver } from '#src/interface-adapters/resolvers/ActivityLogResolver.js';
import { ContactResolver } from '#src/interface-adapters/resolvers/ContactResolver.js';
import { LoginEventResolver } from '#src/interface-adapters/resolvers/LoginEventResolver.js';
import { SecurityActivityResolver } from '#src/interface-adapters/resolvers/SecurityActivityResolver.js';
import { ApiTokenResolver } from '#src/interface-adapters/resolvers/ApiTokenResolver.js';
import { McpOAuthGrantResolver } from '#src/interface-adapters/resolvers/McpOAuthGrantResolver.js';
import { ShareLinkResolver } from '#src/interface-adapters/resolvers/ShareLinkResolver.js';
import { NotificationResolver } from '#src/interface-adapters/resolvers/NotificationResolver.js';
import { CookieConsentResolver } from '#src/interface-adapters/resolvers/CookieConsentResolver.js';
import { SessionResolver } from '#src/interface-adapters/resolvers/SessionResolver.js';
import { OAuthResolver } from '#src/interface-adapters/resolvers/OAuthResolver.js';
import { WorkExperienceResolver } from '#src/interface-adapters/resolvers/WorkExperienceResolver.js';
import { EducationResolver } from '#src/interface-adapters/resolvers/EducationResolver.js';
import { SkillResolver } from '#src/interface-adapters/resolvers/SkillResolver.js';
import { OfferResolver } from '#src/interface-adapters/resolvers/OfferResolver.js';
import { CalendarResolver } from '#src/interface-adapters/resolvers/CalendarResolver.js';
import { McpController } from '#src/interface-adapters/mcp/McpController.js';

import type { Cradle } from './types.js';

export const resolvers = {
  authResolver: asClass(AuthResolver, { lifetime: Lifetime.SINGLETON }),
  applicationResolver: asClass(ApplicationResolver, { lifetime: Lifetime.SINGLETON }),
  noteResolver: asClass(NoteResolver, { lifetime: Lifetime.SINGLETON }),
  documentResolver: asClass(DocumentResolver, { lifetime: Lifetime.SINGLETON }),
  companyBriefingResolver: asClass(CompanyBriefingResolver, { lifetime: Lifetime.SINGLETON }),
  documentDraftResolver: asClass(DocumentDraftResolver, { lifetime: Lifetime.SINGLETON }),
  userResolver: asClass(UserResolver, { lifetime: Lifetime.SINGLETON }),
  interviewRoundResolver: asClass(InterviewRoundResolver, { lifetime: Lifetime.SINGLETON }),
  activityLogResolver: asClass(ActivityLogResolver, { lifetime: Lifetime.SINGLETON }),
  contactResolver: asClass(ContactResolver, { lifetime: Lifetime.SINGLETON }),
  loginEventResolver: asClass(LoginEventResolver, { lifetime: Lifetime.SINGLETON }),
  securityActivityResolver: asClass(SecurityActivityResolver, { lifetime: Lifetime.SINGLETON }),
  apiTokenResolver: asClass(ApiTokenResolver, { lifetime: Lifetime.SINGLETON }),
  mcpOAuthGrantResolver: asClass(McpOAuthGrantResolver, { lifetime: Lifetime.SINGLETON }),
  shareLinkResolver: asClass(ShareLinkResolver, { lifetime: Lifetime.SINGLETON }),
  notificationResolver: asClass(NotificationResolver, { lifetime: Lifetime.SINGLETON }),
  cookieConsentResolver: asClass(CookieConsentResolver, { lifetime: Lifetime.SINGLETON }),
  sessionResolver: asClass(SessionResolver, { lifetime: Lifetime.SINGLETON }),
  oauthResolver: asClass(OAuthResolver, { lifetime: Lifetime.SINGLETON }),
  workExperienceResolver: asClass(WorkExperienceResolver, { lifetime: Lifetime.SINGLETON }),
  educationResolver: asClass(EducationResolver, { lifetime: Lifetime.SINGLETON }),
  skillResolver: asClass(SkillResolver, { lifetime: Lifetime.SINGLETON }),
  offerResolver: asClass(OfferResolver, { lifetime: Lifetime.SINGLETON }),
  calendarResolver: asClass(CalendarResolver, { lifetime: Lifetime.SINGLETON }),
  mcpController: asClass(McpController, { lifetime: Lifetime.SINGLETON }),
} satisfies NameAndRegistrationPair<Cradle>;
