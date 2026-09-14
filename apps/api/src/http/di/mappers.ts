import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { OAuthAccountMapper } from '#src/interface-adapters/mappers/OAuthAccountMapper.js';
import { ApplicationMapper } from '#src/interface-adapters/mappers/ApplicationMapper.js';
import { NoteMapper } from '#src/interface-adapters/mappers/NoteMapper.js';
import { DocumentMapper } from '#src/interface-adapters/mappers/DocumentMapper.js';
import { DocumentDraftMapper } from '#src/interface-adapters/mappers/DocumentDraftMapper.js';
import { CompanyBriefingMapper } from '#src/interface-adapters/mappers/CompanyBriefingMapper.js';
import { UserMapper } from '#src/interface-adapters/mappers/UserMapper.js';
import { InterviewRoundMapper } from '#src/interface-adapters/mappers/InterviewRoundMapper.js';
import { ActivityLogMapper } from '#src/interface-adapters/mappers/ActivityLogMapper.js';
import { ContactMapper } from '#src/interface-adapters/mappers/ContactMapper.js';
import { LoginEventMapper } from '#src/interface-adapters/mappers/LoginEventMapper.js';
import { SecurityActivityMapper } from '#src/interface-adapters/mappers/SecurityActivityMapper.js';
import { MessageMapper } from '#src/interface-adapters/mappers/MessageMapper.js';
import { ConversationMapper } from '#src/interface-adapters/mappers/ConversationMapper.js';
import { SessionMapper } from '#src/interface-adapters/mappers/SessionMapper.js';
import { WorkExperienceMapper } from '#src/interface-adapters/mappers/WorkExperienceMapper.js';
import { EducationMapper } from '#src/interface-adapters/mappers/EducationMapper.js';
import { SkillMapper } from '#src/interface-adapters/mappers/SkillMapper.js';
import { ApiTokenMapper } from '#src/interface-adapters/mappers/ApiTokenMapper.js';
import { McpOAuthGrantMapper } from '#src/interface-adapters/mappers/McpOAuthGrantMapper.js';
import { ShareLinkMapper } from '#src/interface-adapters/mappers/ShareLinkMapper.js';
import { NotificationMapper } from '#src/interface-adapters/mappers/NotificationMapper.js';
import { LlmApiKeyMapper } from '#src/interface-adapters/mappers/LlmApiKeyMapper.js';
import { LlmUsageSummaryMapper } from '#src/interface-adapters/mappers/LlmUsageSummaryMapper.js';
import { OfferMapper } from '#src/interface-adapters/mappers/OfferMapper.js';
import { CalendarConnectionMapper } from '#src/interface-adapters/mappers/CalendarConnectionMapper.js';

import type { Cradle } from './types.js';

export const mappers = {
  applicationMapper: asClass(ApplicationMapper, { lifetime: Lifetime.SINGLETON }),
  apiTokenMapper: asClass(ApiTokenMapper, { lifetime: Lifetime.SINGLETON }),
  mcpOAuthGrantMapper: asClass(McpOAuthGrantMapper, { lifetime: Lifetime.SINGLETON }),
  shareLinkMapper: asClass(ShareLinkMapper, { lifetime: Lifetime.SINGLETON }),
  notificationMapper: asClass(NotificationMapper, { lifetime: Lifetime.SINGLETON }),
  noteMapper: asClass(NoteMapper, { lifetime: Lifetime.SINGLETON }),
  documentMapper: asClass(DocumentMapper, { lifetime: Lifetime.SINGLETON }),
  companyBriefingMapper: asClass(CompanyBriefingMapper, { lifetime: Lifetime.SINGLETON }),
  documentDraftMapper: asClass(DocumentDraftMapper, { lifetime: Lifetime.SINGLETON }),
  userMapper: asClass(UserMapper, { lifetime: Lifetime.SINGLETON }),
  interviewRoundMapper: asClass(InterviewRoundMapper, { lifetime: Lifetime.SINGLETON }),
  activityLogMapper: asClass(ActivityLogMapper, { lifetime: Lifetime.SINGLETON }),
  contactMapper: asClass(ContactMapper, { lifetime: Lifetime.SINGLETON }),
  loginEventMapper: asClass(LoginEventMapper, { lifetime: Lifetime.SINGLETON }),
  securityActivityMapper: asClass(SecurityActivityMapper, { lifetime: Lifetime.SINGLETON }),
  messageMapper: asClass(MessageMapper, { lifetime: Lifetime.SINGLETON }),
  conversationMapper: asClass(ConversationMapper, { lifetime: Lifetime.SINGLETON }),
  llmApiKeyMapper: asClass(LlmApiKeyMapper, { lifetime: Lifetime.SINGLETON }),
  llmUsageSummaryMapper: asClass(LlmUsageSummaryMapper, { lifetime: Lifetime.SINGLETON }),
  sessionMapper: asClass(SessionMapper, { lifetime: Lifetime.SINGLETON }),
  workExperienceMapper: asClass(WorkExperienceMapper, { lifetime: Lifetime.SINGLETON }),
  educationMapper: asClass(EducationMapper, { lifetime: Lifetime.SINGLETON }),
  skillMapper: asClass(SkillMapper, { lifetime: Lifetime.SINGLETON }),
  offerMapper: asClass(OfferMapper, { lifetime: Lifetime.SINGLETON }),
  calendarConnectionMapper: asClass(CalendarConnectionMapper, { lifetime: Lifetime.SINGLETON }),
  oauthAccountMapper: asClass(OAuthAccountMapper, { lifetime: Lifetime.SINGLETON }),
} satisfies NameAndRegistrationPair<Cradle>;
