/* eslint-disable */
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = {
  [_ in K]?: never;
};
export type Incremental<T> =
  T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
};

export type ActivityEventType =
  | 'document_deleted'
  | 'document_uploaded'
  | 'field_updated'
  | 'interview_added'
  | 'note_added'
  | 'note_deleted'
  | 'status_changed';

export type ActivityLog = {
  __typename?: 'ActivityLog';
  actorId?: Maybe<Scalars['String']['output']>;
  applicationId?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  eventType?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  payload?: Maybe<Scalars['String']['output']>;
};

/** What one hosted AI action costs, in credits. */
export type AiCreditCost = {
  __typename?: 'AiCreditCost';
  credits: Scalars['Int']['output'];
  feature: Scalars['String']['output'];
};

/** This month's hosted AI credits. Calls on the user's own key are never counted. */
export type AiCredits = {
  __typename?: 'AiCredits';
  /** Welcome-bonus credits still unspent; 0 after the first 14 days. */
  bonusRemaining?: Maybe<Scalars['Int']['output']>;
  /** What each AI action costs in credits (the same on every plan). */
  costs: Array<AiCreditCost>;
  /** The plan's monthly size, without the welcome bonus. */
  limit?: Maybe<Scalars['Int']['output']>;
  resetsAt?: Maybe<Scalars['String']['output']>;
  used?: Maybe<Scalars['Int']['output']>;
};

export type AiFeedbackRating = 'DOWN' | 'UP';

export type AiFeedbackReason =
  'IGNORED_MY_REQUEST' | 'NOT_USEFUL' | 'OTHER' | 'UNSAFE_OR_INAPPROPRIATE' | 'WRONG_OR_MADE_UP';

export type AiFeedbackTarget = 'CHAT_MESSAGE' | 'DOCUMENT_DRAFT';

export type AiRating = {
  __typename?: 'AiRating';
  rating?: Maybe<AiFeedbackRating>;
  reason?: Maybe<AiFeedbackReason>;
};

export type AnswerSource = 'ai' | 'user';

export type ApiToken = {
  __typename?: 'ApiToken';
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  lastUsedAt?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  scope?: Maybe<Scalars['String']['output']>;
};

export type ApiTokenScope = 'full' | 'read';

export type ApplicationChannelAnalytics = {
  __typename?: 'ApplicationChannelAnalytics';
  bySource?: Maybe<Array<ApplicationGroupStat>>;
  byTag?: Maybe<Array<ApplicationGroupStat>>;
};

export type ApplicationConnection = {
  __typename?: 'ApplicationConnection';
  hasNextPage?: Maybe<Scalars['Boolean']['output']>;
  items?: Maybe<Array<JobApplication>>;
  nextCursor?: Maybe<Scalars['String']['output']>;
};

export type ApplicationGroupStat = {
  __typename?: 'ApplicationGroupStat';
  applicationCount?: Maybe<Scalars['Int']['output']>;
  label?: Maybe<Scalars['String']['output']>;
  offerCount?: Maybe<Scalars['Int']['output']>;
  offerRate?: Maybe<Scalars['Int']['output']>;
  respondedCount?: Maybe<Scalars['Int']['output']>;
  responseRate?: Maybe<Scalars['Int']['output']>;
};

export type ApplicationHealthScore = {
  __typename?: 'ApplicationHealthScore';
  criteria?: Maybe<Array<HealthScoreCriterion>>;
  label?: Maybe<Scalars['String']['output']>;
  score?: Maybe<Scalars['Int']['output']>;
};

export type ApplicationSectionCounts = {
  __typename?: 'ApplicationSectionCounts';
  companyBriefing?: Maybe<Scalars['Boolean']['output']>;
  contacts?: Maybe<Scalars['Int']['output']>;
  documentDrafts?: Maybe<Scalars['Int']['output']>;
  documents?: Maybe<Scalars['Int']['output']>;
  interviews?: Maybe<Scalars['Int']['output']>;
  notes?: Maybe<Scalars['Int']['output']>;
  offers?: Maybe<Scalars['Int']['output']>;
};

export type ApplicationStatus =
  'accepted' | 'applied' | 'draft' | 'interviewing' | 'offered' | 'rejected' | 'withdrawn';

export type AtsCheck = {
  __typename?: 'AtsCheck';
  hint?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  label?: Maybe<Scalars['String']['output']>;
  maxPoints?: Maybe<Scalars['Int']['output']>;
  passed?: Maybe<Scalars['Boolean']['output']>;
  points?: Maybe<Scalars['Int']['output']>;
};

export type AtsScore = {
  __typename?: 'AtsScore';
  applicationId?: Maybe<Scalars['ID']['output']>;
  checks?: Maybe<Array<AtsCheck>>;
  documentDraftId?: Maybe<Scalars['ID']['output']>;
  documentId?: Maybe<Scalars['ID']['output']>;
  generatedAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  isStale?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Scalars['String']['output']>;
  readable?: Maybe<Scalars['Boolean']['output']>;
  score?: Maybe<Scalars['Int']['output']>;
};

export type Award = {
  __typename?: 'Award';
  createdAt?: Maybe<Scalars['String']['output']>;
  date?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  issuer?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['ID']['output']>;
};

/** A page at the payment provider to send the browser to (JEF-426). Use it once; it expires. */
export type BillingRedirect = {
  __typename?: 'BillingRedirect';
  url?: Maybe<Scalars['String']['output']>;
};

export type BillingStatus = {
  __typename?: 'BillingStatus';
  aiCredits?: Maybe<AiCredits>;
  catalogue?: Maybe<PlanCatalogue>;
  /** False when this instance does not enforce plans: every feature is then on. */
  enforced?: Maybe<Scalars['Boolean']['output']>;
  features?: Maybe<PlanFeatures>;
  limits?: Maybe<PlanLimits>;
  plan?: Maybe<Plan>;
  planExpiresAt?: Maybe<Scalars['String']['output']>;
  planSource?: Maybe<PlanSource>;
  usage?: Maybe<PlanUsage>;
};

export type BulkRestoreResult = {
  __typename?: 'BulkRestoreResult';
  restored?: Maybe<Scalars['Int']['output']>;
};

export type CalendarEvent = {
  __typename?: 'CalendarEvent';
  applicationId?: Maybe<Scalars['ID']['output']>;
  company?: Maybe<Scalars['String']['output']>;
  date?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  interviewRoundType?: Maybe<InterviewRoundType>;
  role?: Maybe<Scalars['String']['output']>;
  type?: Maybe<CalendarEventType>;
};

export type CalendarEventType = 'applied' | 'followUp' | 'interview';

export type Certification = {
  __typename?: 'Certification';
  createdAt?: Maybe<Scalars['String']['output']>;
  credentialUrl?: Maybe<Scalars['String']['output']>;
  expiresAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  issuedAt?: Maybe<Scalars['String']['output']>;
  issuer?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['ID']['output']>;
};

export type ChatActionProposal = {
  __typename?: 'ChatActionProposal';
  error?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  status?: Maybe<Scalars['String']['output']>;
  summary?: Maybe<Scalars['String']['output']>;
  toolName?: Maybe<Scalars['String']['output']>;
};

/** What can be bought. The server picks the price, including any founder price. */
export type CheckoutPlan = 'monthly' | 'pass3Months' | 'pass6Months';

export type CompanyBriefing = {
  __typename?: 'CompanyBriefing';
  applicationId?: Maybe<Scalars['ID']['output']>;
  content?: Maybe<Scalars['String']['output']>;
  generatedAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  sources?: Maybe<Array<CompanySource>>;
};

export type CompanySource = {
  __typename?: 'CompanySource';
  publishedAt?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type ConfirmDocumentInput = {
  applicationId: Scalars['ID']['input'];
  documentType?: InputMaybe<Scalars['String']['input']>;
  mimeType: Scalars['String']['input'];
  name: Scalars['String']['input'];
  sizeBytes: Scalars['Int']['input'];
  storageKey: Scalars['String']['input'];
  version?: InputMaybe<Scalars['String']['input']>;
};

export type ConfirmTotpSetupResult = {
  __typename?: 'ConfirmTotpSetupResult';
  backupCodes?: Maybe<Array<Scalars['String']['output']>>;
};

export type Contact = {
  __typename?: 'Contact';
  applicationId?: Maybe<Scalars['ID']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  linkedinUrl?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  phone?: Maybe<Scalars['String']['output']>;
  role?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type ContentQuota = {
  __typename?: 'ContentQuota';
  limits?: Maybe<ContentQuotaLimits>;
  usage?: Maybe<ContentQuotaUsage>;
};

/** The most a user may hold of each resource, and the longest a free-text field may be. The same for every plan (JEF-339). */
export type ContentQuotaLimits = {
  __typename?: 'ContentQuotaLimits';
  apiTokensPerUser?: Maybe<Scalars['Int']['output']>;
  contactsPerApplication?: Maybe<Scalars['Int']['output']>;
  conversationsPerUser?: Maybe<Scalars['Int']['output']>;
  documentDraftsPerApplication?: Maybe<Scalars['Int']['output']>;
  educationsPerUser?: Maybe<Scalars['Int']['output']>;
  expoPushTokensPerUser?: Maybe<Scalars['Int']['output']>;
  interviewRoundsPerApplication?: Maybe<Scalars['Int']['output']>;
  /** Past this the oldest messages are removed to make room. */
  messagesPerConversation?: Maybe<Scalars['Int']['output']>;
  noteContentMaxLength?: Maybe<Scalars['Int']['output']>;
  notesPerApplication?: Maybe<Scalars['Int']['output']>;
  offersPerApplication?: Maybe<Scalars['Int']['output']>;
  pushSubscriptionsPerUser?: Maybe<Scalars['Int']['output']>;
  shareLinksPerUser?: Maybe<Scalars['Int']['output']>;
  skillsPerUser?: Maybe<Scalars['Int']['output']>;
  tagNameMaxLength?: Maybe<Scalars['Int']['output']>;
  tagsPerApplication?: Maybe<Scalars['Int']['output']>;
  workExperiencesPerUser?: Maybe<Scalars['Int']['output']>;
};

/** What the user holds of each per-user resource. Per-application counts are on Application.sectionCounts and Application.tags. */
export type ContentQuotaUsage = {
  __typename?: 'ContentQuotaUsage';
  apiTokens?: Maybe<Scalars['Int']['output']>;
  conversations?: Maybe<Scalars['Int']['output']>;
  educations?: Maybe<Scalars['Int']['output']>;
  expoPushTokens?: Maybe<Scalars['Int']['output']>;
  pushSubscriptions?: Maybe<Scalars['Int']['output']>;
  shareLinks?: Maybe<Scalars['Int']['output']>;
  skills?: Maybe<Scalars['Int']['output']>;
  workExperiences?: Maybe<Scalars['Int']['output']>;
};

export type Conversation = {
  __typename?: 'Conversation';
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  llmModel?: Maybe<Scalars['String']['output']>;
  llmProvider?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type CreateApiTokenPayload = {
  __typename?: 'CreateApiTokenPayload';
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  scope?: Maybe<Scalars['String']['output']>;
  token?: Maybe<Scalars['String']['output']>;
};

export type CreateApplicationInput = {
  company: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  followUpAt?: InputMaybe<Scalars['String']['input']>;
  jobUrl?: InputMaybe<Scalars['String']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  postingText?: InputMaybe<Scalars['String']['input']>;
  role: Scalars['String']['input'];
  salaryRange?: InputMaybe<Scalars['String']['input']>;
  source?: InputMaybe<Scalars['String']['input']>;
  starred?: InputMaybe<Scalars['Boolean']['input']>;
  status?: InputMaybe<ApplicationStatus>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type CreateAwardInput = {
  date?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  issuer?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
};

export type CreateCertificationInput = {
  credentialUrl?: InputMaybe<Scalars['String']['input']>;
  expiresAt?: InputMaybe<Scalars['String']['input']>;
  issuedAt?: InputMaybe<Scalars['String']['input']>;
  issuer?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};

export type CreateDocumentDraftInput = {
  applicationId: Scalars['ID']['input'];
  contentJson?: InputMaybe<Scalars['String']['input']>;
  plainText?: InputMaybe<Scalars['String']['input']>;
  sourceDocumentId?: InputMaybe<Scalars['ID']['input']>;
  title: Scalars['String']['input'];
  type: Scalars['String']['input'];
};

export type CreateEducationInput = {
  degree?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  field?: InputMaybe<Scalars['String']['input']>;
  institution: Scalars['String']['input'];
  startDate: Scalars['String']['input'];
};

export type CreateInterviewQuestionInput = {
  answer?: InputMaybe<Scalars['String']['input']>;
  interviewRoundId: Scalars['ID']['input'];
  question: Scalars['String']['input'];
};

export type CreateInterviewRoundInput = {
  applicationId: Scalars['ID']['input'];
  completedAt?: InputMaybe<Scalars['String']['input']>;
  interviewerName?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  outcome?: InputMaybe<InterviewRoundOutcome>;
  scheduledAt?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<InterviewRoundType>;
};

export type CreateLanguageInput = {
  name: Scalars['String']['input'];
  proficiency?: InputMaybe<Scalars['String']['input']>;
};

export type CreateMockInterviewQuestionInput = {
  answer?: InputMaybe<Scalars['String']['input']>;
  answerSource?: InputMaybe<AnswerSource>;
  interviewRoundId: Scalars['ID']['input'];
  question: Scalars['String']['input'];
};

export type CreateOfferInput = {
  applicationId: Scalars['ID']['input'];
  baseSalary: Scalars['Int']['input'];
  benefits?: InputMaybe<Scalars['String']['input']>;
  bonus?: InputMaybe<Scalars['Int']['input']>;
  costOfLivingAdjustment?: InputMaybe<Scalars['Int']['input']>;
  currency?: InputMaybe<Scalars['String']['input']>;
  equity?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  period?: InputMaybe<Scalars['String']['input']>;
};

export type CreateProjectInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  role?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
};

export type CreateShareLinkPayload = {
  __typename?: 'CreateShareLinkPayload';
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  token?: Maybe<Scalars['String']['output']>;
};

export type CreateSkillInput = {
  category?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  proficiency?: InputMaybe<Scalars['String']['input']>;
};

export type CreateWorkExperienceInput = {
  company: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  startDate: Scalars['String']['input'];
  title: Scalars['String']['input'];
};

export type CurrencyGroupStat = {
  __typename?: 'CurrencyGroupStat';
  averageYearlySalary?: Maybe<Scalars['Float']['output']>;
  count?: Maybe<Scalars['Int']['output']>;
  currency?: Maybe<Scalars['String']['output']>;
  maxYearlySalary?: Maybe<Scalars['Float']['output']>;
  medianYearlySalary?: Maybe<Scalars['Float']['output']>;
  minYearlySalary?: Maybe<Scalars['Float']['output']>;
};

export type DigestFrequency = 'DAILY' | 'OFF' | 'WEEKLY';

export type Document = {
  __typename?: 'Document';
  applicationId?: Maybe<Scalars['ID']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  documentType?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  mimeType?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  sizeBytes?: Maybe<Scalars['Int']['output']>;
  sourceDraftId?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
  version?: Maybe<Scalars['String']['output']>;
};

export type DocumentDraft = {
  __typename?: 'DocumentDraft';
  aiGenerated?: Maybe<Scalars['Boolean']['output']>;
  aiInstructions?: Maybe<Scalars['String']['output']>;
  applicationId?: Maybe<Scalars['ID']['output']>;
  contentJson?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  myRating?: Maybe<AiRating>;
  plainText?: Maybe<Scalars['String']['output']>;
  sourceDocumentId?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type DocumentDraftVersion = {
  __typename?: 'DocumentDraftVersion';
  characterCount?: Maybe<Scalars['Int']['output']>;
  contentJson?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  draftId?: Maybe<Scalars['ID']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  plainText?: Maybe<Scalars['String']['output']>;
  source?: Maybe<Scalars['String']['output']>;
};

export type DocumentVersionOutcome = {
  __typename?: 'DocumentVersionOutcome';
  applicationCount?: Maybe<Scalars['Int']['output']>;
  documentType?: Maybe<Scalars['String']['output']>;
  interviewCount?: Maybe<Scalars['Int']['output']>;
  interviewRate?: Maybe<Scalars['Int']['output']>;
  version?: Maybe<Scalars['String']['output']>;
};

export type Education = {
  __typename?: 'Education';
  createdAt?: Maybe<Scalars['String']['output']>;
  degree?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  endDate?: Maybe<Scalars['String']['output']>;
  field?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  institution?: Maybe<Scalars['String']['output']>;
  startDate?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['ID']['output']>;
};

export type EmptyTrashResult = {
  __typename?: 'EmptyTrashResult';
  deleted?: Maybe<Scalars['Int']['output']>;
  failed?: Maybe<Scalars['Int']['output']>;
};

export type ExtractDocumentTextPayload = {
  __typename?: 'ExtractDocumentTextPayload';
  text?: Maybe<Scalars['String']['output']>;
};

export type GeneratedDraftContent = {
  __typename?: 'GeneratedDraftContent';
  contentJson: Scalars['String']['output'];
  plainText: Scalars['String']['output'];
};

export type GeneratedMockAnswer = {
  __typename?: 'GeneratedMockAnswer';
  answer?: Maybe<Scalars['String']['output']>;
  usedBriefing?: Maybe<Scalars['Boolean']['output']>;
  usedDocument?: Maybe<Scalars['Boolean']['output']>;
  usedJobDescription?: Maybe<Scalars['Boolean']['output']>;
  usedProfile?: Maybe<Scalars['Boolean']['output']>;
};

export type GeneratedMockQuestions = {
  __typename?: 'GeneratedMockQuestions';
  suggestions?: Maybe<Array<Scalars['String']['output']>>;
  usedBriefing?: Maybe<Scalars['Boolean']['output']>;
  usedDocument?: Maybe<Scalars['Boolean']['output']>;
  usedJobDescription?: Maybe<Scalars['Boolean']['output']>;
  usedProfile?: Maybe<Scalars['Boolean']['output']>;
};

export type GeneratedTalkingPoints = {
  __typename?: 'GeneratedTalkingPoints';
  nothingRelevant?: Maybe<Scalars['Boolean']['output']>;
  question?: Maybe<MockInterviewQuestion>;
  usedDocument?: Maybe<Scalars['Boolean']['output']>;
  usedProfile?: Maybe<Scalars['Boolean']['output']>;
};

export type HealthScoreCriterion = {
  __typename?: 'HealthScoreCriterion';
  earned?: Maybe<Scalars['Int']['output']>;
  key?: Maybe<Scalars['String']['output']>;
  label?: Maybe<Scalars['String']['output']>;
  met?: Maybe<Scalars['Boolean']['output']>;
  points?: Maybe<Scalars['Int']['output']>;
};

export type ImportCvAwardInput = {
  date?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  issuer?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
};

export type ImportCvCertificationInput = {
  credentialUrl?: InputMaybe<Scalars['String']['input']>;
  expiresAt?: InputMaybe<Scalars['String']['input']>;
  issuedAt?: InputMaybe<Scalars['String']['input']>;
  issuer?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};

export type ImportCvContactInput = {
  links?: InputMaybe<Array<Scalars['String']['input']>>;
  location?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
};

export type ImportCvEducationInput = {
  degree?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  field?: InputMaybe<Scalars['String']['input']>;
  institution: Scalars['String']['input'];
  startDate: Scalars['String']['input'];
};

export type ImportCvLanguageInput = {
  name: Scalars['String']['input'];
  proficiency?: InputMaybe<Scalars['String']['input']>;
};

export type ImportCvProfileInput = {
  awards?: InputMaybe<Array<ImportCvAwardInput>>;
  certifications?: InputMaybe<Array<ImportCvCertificationInput>>;
  contact?: InputMaybe<ImportCvContactInput>;
  educations: Array<ImportCvEducationInput>;
  languages?: InputMaybe<Array<ImportCvLanguageInput>>;
  projects?: InputMaybe<Array<ImportCvProjectInput>>;
  skills: Array<ImportCvSkillInput>;
  workExperiences: Array<ImportCvWorkExperienceInput>;
};

export type ImportCvProfileResult = {
  __typename?: 'ImportCvProfileResult';
  awards?: Maybe<Scalars['Int']['output']>;
  certifications?: Maybe<Scalars['Int']['output']>;
  educations?: Maybe<Scalars['Int']['output']>;
  filledContact?: Maybe<Array<Scalars['String']['output']>>;
  languages?: Maybe<Scalars['Int']['output']>;
  projects?: Maybe<Scalars['Int']['output']>;
  skills?: Maybe<Scalars['Int']['output']>;
  workExperiences?: Maybe<Scalars['Int']['output']>;
};

export type ImportCvProjectInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  role?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
};

export type ImportCvSkillInput = {
  category?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  proficiency?: InputMaybe<Scalars['String']['input']>;
};

export type ImportCvWorkExperienceInput = {
  company: Scalars['String']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  startDate: Scalars['String']['input'];
  title: Scalars['String']['input'];
};

export type ImportSummary = {
  __typename?: 'ImportSummary';
  applicationsImported?: Maybe<Scalars['Int']['output']>;
  applicationsSkipped?: Maybe<Scalars['Int']['output']>;
  documentsSkipped?: Maybe<Scalars['Int']['output']>;
  notesImported?: Maybe<Scalars['Int']['output']>;
};

export type InterviewQuestion = {
  __typename?: 'InterviewQuestion';
  answer?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  interviewRoundId?: Maybe<Scalars['ID']['output']>;
  position?: Maybe<Scalars['Int']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type InterviewRound = {
  __typename?: 'InterviewRound';
  applicationId?: Maybe<Scalars['ID']['output']>;
  completedAt?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  interviewerName?: Maybe<Scalars['String']['output']>;
  mockQuestionCount?: Maybe<Scalars['Int']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  outcome?: Maybe<InterviewRoundOutcome>;
  questionCount?: Maybe<Scalars['Int']['output']>;
  scheduledAt?: Maybe<Scalars['String']['output']>;
  type?: Maybe<InterviewRoundType>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type InterviewRoundAnalytics = {
  __typename?: 'InterviewRoundAnalytics';
  byType?: Maybe<Array<InterviewRoundTypeStat>>;
  roundsToOffer?: Maybe<RoundsToTerminalStat>;
  roundsToRejection?: Maybe<RoundsToTerminalStat>;
};

export type InterviewRoundOutcome = 'cancelled' | 'failed' | 'passed' | 'pending';

export type InterviewRoundType = 'hr' | 'onsite' | 'other' | 'phone' | 'technical';

export type InterviewRoundTypeStat = {
  __typename?: 'InterviewRoundTypeStat';
  cancelled?: Maybe<Scalars['Int']['output']>;
  failed?: Maybe<Scalars['Int']['output']>;
  passed?: Maybe<Scalars['Int']['output']>;
  pending?: Maybe<Scalars['Int']['output']>;
  type?: Maybe<InterviewRoundType>;
};

export type JobApplication = {
  __typename?: 'JobApplication';
  appliedAt?: Maybe<Scalars['String']['output']>;
  boardPosition?: Maybe<Scalars['Int']['output']>;
  company?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  deletedAt?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  followUpAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  jobUrl?: Maybe<Scalars['String']['output']>;
  likelyGhosted?: Maybe<Scalars['Boolean']['output']>;
  location?: Maybe<Scalars['String']['output']>;
  /** The full job posting text, when captured. AI features read it in preference to the description. */
  postingText?: Maybe<Scalars['String']['output']>;
  purgeAt?: Maybe<Scalars['String']['output']>;
  role?: Maybe<Scalars['String']['output']>;
  salaryRange?: Maybe<Scalars['String']['output']>;
  sectionCounts?: Maybe<ApplicationSectionCounts>;
  source?: Maybe<Scalars['String']['output']>;
  starred?: Maybe<Scalars['Boolean']['output']>;
  status?: Maybe<ApplicationStatus>;
  tags?: Maybe<Array<Scalars['String']['output']>>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['ID']['output']>;
};

export type Language = {
  __typename?: 'Language';
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  proficiency?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['ID']['output']>;
};

export type LinkedOAuthAccount = {
  __typename?: 'LinkedOAuthAccount';
  createdAt?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  provider?: Maybe<OAuthProvider>;
};

export type LlmApiKey = {
  __typename?: 'LlmApiKey';
  baseUrl?: Maybe<Scalars['String']['output']>;
  model?: Maybe<Scalars['String']['output']>;
  monthlyTokenLimit?: Maybe<Scalars['Int']['output']>;
  provider?: Maybe<Scalars['String']['output']>;
};

export type LlmUsageSummary = {
  __typename?: 'LlmUsageSummary';
  cacheReadTokens?: Maybe<Scalars['Int']['output']>;
  cacheWriteTokens?: Maybe<Scalars['Int']['output']>;
  completionTokens?: Maybe<Scalars['Int']['output']>;
  lastUsedAt?: Maybe<Scalars['String']['output']>;
  limitReached?: Maybe<Scalars['Boolean']['output']>;
  monthlyTokenLimit?: Maybe<Scalars['Int']['output']>;
  promptTokens?: Maybe<Scalars['Int']['output']>;
  provider?: Maybe<Scalars['String']['output']>;
  requestCount?: Maybe<Scalars['Int']['output']>;
};

export type LoginEvent = {
  __typename?: 'LoginEvent';
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  ipAddress?: Maybe<Scalars['String']['output']>;
  userAgent?: Maybe<Scalars['String']['output']>;
};

export type LoginResult = {
  __typename?: 'LoginResult';
  accessToken?: Maybe<Scalars['String']['output']>;
  success?: Maybe<Scalars['Boolean']['output']>;
  totpRequired?: Maybe<Scalars['Boolean']['output']>;
};

export type McpOAuthGrant = {
  __typename?: 'McpOAuthGrant';
  authorizedAt?: Maybe<Scalars['String']['output']>;
  clientName?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  lastUsedAt?: Maybe<Scalars['String']['output']>;
  scope?: Maybe<Scalars['String']['output']>;
};

export type Message = {
  __typename?: 'Message';
  content?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  myRating?: Maybe<AiRating>;
  proposals?: Maybe<Array<ChatActionProposal>>;
  role?: Maybe<Scalars['String']['output']>;
};

export type MobileAuthPayload = {
  __typename?: 'MobileAuthPayload';
  accessToken?: Maybe<Scalars['String']['output']>;
  refreshToken?: Maybe<Scalars['String']['output']>;
};

export type MobileLoginResult = {
  __typename?: 'MobileLoginResult';
  accessToken?: Maybe<Scalars['String']['output']>;
  refreshToken?: Maybe<Scalars['String']['output']>;
  success?: Maybe<Scalars['Boolean']['output']>;
  totpRequired?: Maybe<Scalars['Boolean']['output']>;
};

export type MockInterviewQuestion = {
  __typename?: 'MockInterviewQuestion';
  answer?: Maybe<Scalars['String']['output']>;
  answerSource?: Maybe<AnswerSource>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  interviewRoundId?: Maybe<Scalars['ID']['output']>;
  position?: Maybe<Scalars['Int']['output']>;
  question?: Maybe<Scalars['String']['output']>;
  talkingPoints?: Maybe<Scalars['String']['output']>;
  talkingPointsGeneratedAt?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type MoveApplicationOnBoardInput = {
  applicationId: Scalars['ID']['input'];
  orderedIds: Array<Scalars['ID']['input']>;
  toStatus: ApplicationStatus;
};

export type Mutation = {
  __typename?: 'Mutation';
  beginTotpSetup?: Maybe<TotpSetup>;
  bulkAddTagToApplications?: Maybe<Array<JobApplication>>;
  bulkDeleteApplications?: Maybe<Scalars['Boolean']['output']>;
  bulkRestoreApplications?: Maybe<BulkRestoreResult>;
  bulkUpdateApplications?: Maybe<Array<JobApplication>>;
  /** Cancels the signed-in account’s scheduled deletion. Without a session, pass the token from the mailed link instead. */
  cancelAccountDeletion?: Maybe<Scalars['Boolean']['output']>;
  clearAiOutputRating?: Maybe<Scalars['Boolean']['output']>;
  compareOffers?: Maybe<Array<OfferComparison>>;
  /** Finish or skip the first-run welcome flow (JEF-460). Skipping passes no goals. */
  completeOnboarding?: Maybe<Scalars['Boolean']['output']>;
  computeResumeAtsScore?: Maybe<AtsScore>;
  computeResumeMatchScore?: Maybe<ResumeMatch>;
  /** The mailed link: schedules the deletion and returns its date (ISO 8601). Needs no session; ends every session, so the cookies are cleared. */
  confirmAccountDeletion?: Maybe<Scalars['String']['output']>;
  confirmAvatar?: Maybe<Scalars['String']['output']>;
  confirmBackupEmail?: Maybe<Scalars['Boolean']['output']>;
  confirmChatAction?: Maybe<ChatActionProposal>;
  confirmDocument?: Maybe<Document>;
  confirmEmailChange?: Maybe<Scalars['Boolean']['output']>;
  confirmTotpSetup?: Maybe<ConfirmTotpSetupResult>;
  createApiToken?: Maybe<CreateApiTokenPayload>;
  createApplication?: Maybe<JobApplication>;
  createAward?: Maybe<Award>;
  /** Opens the payment provider's page to manage or cancel. Fails until the user has paid once. */
  createBillingPortalSession?: Maybe<BillingRedirect>;
  createCertification?: Maybe<Certification>;
  /** Starts a purchase of Pro. Refuses an active subscriber, who would pay twice for the same time. */
  createCheckoutSession?: Maybe<BillingRedirect>;
  createContact?: Maybe<Contact>;
  createConversation?: Maybe<Conversation>;
  createDocumentDraft?: Maybe<DocumentDraft>;
  createDocumentDraftVersion?: Maybe<DocumentDraftVersion>;
  createEducation?: Maybe<Education>;
  createInterviewQuestion?: Maybe<InterviewQuestion>;
  createInterviewRound?: Maybe<InterviewRound>;
  createLanguage?: Maybe<Language>;
  createMockInterviewQuestion?: Maybe<MockInterviewQuestion>;
  createNote?: Maybe<Note>;
  createOffer?: Maybe<Offer>;
  createProject?: Maybe<Project>;
  createShareLink?: Maybe<CreateShareLinkPayload>;
  createSkill?: Maybe<Skill>;
  createWorkExperience?: Maybe<WorkExperience>;
  /** @deprecated Use requestAccountDeletion. Kept for shipped app versions (JEF-417): it now mails the confirmation link and deletes nothing itself. */
  deleteAccount?: Maybe<Scalars['Boolean']['output']>;
  deleteApiToken?: Maybe<Scalars['Boolean']['output']>;
  deleteApplication?: Maybe<Scalars['Boolean']['output']>;
  deleteAward?: Maybe<Scalars['Boolean']['output']>;
  deleteCertification?: Maybe<Scalars['Boolean']['output']>;
  deleteContact?: Maybe<Scalars['Boolean']['output']>;
  deleteConversation?: Maybe<Scalars['Boolean']['output']>;
  deleteDocument?: Maybe<Scalars['Boolean']['output']>;
  deleteDocumentDraft?: Maybe<Scalars['Boolean']['output']>;
  deleteEducation?: Maybe<Scalars['Boolean']['output']>;
  deleteInterviewQuestion?: Maybe<Scalars['Boolean']['output']>;
  deleteInterviewRound?: Maybe<Scalars['Boolean']['output']>;
  deleteLanguage?: Maybe<Scalars['Boolean']['output']>;
  deleteLlmApiKey?: Maybe<Scalars['Boolean']['output']>;
  deleteMockInterviewQuestion?: Maybe<Scalars['Boolean']['output']>;
  deleteNote?: Maybe<Scalars['Boolean']['output']>;
  deleteOffer?: Maybe<Scalars['Boolean']['output']>;
  deleteProject?: Maybe<Scalars['Boolean']['output']>;
  deleteShareLink?: Maybe<Scalars['Boolean']['output']>;
  deleteSkill?: Maybe<Scalars['Boolean']['output']>;
  deleteWorkExperience?: Maybe<Scalars['Boolean']['output']>;
  disableTotp?: Maybe<Scalars['Boolean']['output']>;
  dismissChatAction?: Maybe<ChatActionProposal>;
  dismissOnboardingChecklist?: Maybe<Scalars['Boolean']['output']>;
  /** Answer "no" to one resume gap question for an application, so it is not asked again. Returns the questions that are left. */
  dismissResumeGap?: Maybe<ResumeGaps>;
  emptyTrash?: Maybe<EmptyTrashResult>;
  exchangeMobileOAuthCode?: Maybe<MobileAuthPayload>;
  exportDocumentDraftToPdf?: Maybe<Document>;
  extractDocumentText?: Maybe<ExtractDocumentTextPayload>;
  /** Read what an application’s posting asks for, with AI, and save it. Returns the saved list without a call when the posting has not changed. */
  extractPostingRequirements?: Maybe<PostingRequirements>;
  generateCompanyBriefing?: Maybe<CompanyBriefing>;
  generateCoverLetter?: Maybe<DocumentDraft>;
  /** Generates content for an existing draft from the application and the profile. Saves nothing and creates no draft. */
  generateIntoDocumentDraft: GeneratedDraftContent;
  generateMockInterviewAnswer?: Maybe<GeneratedMockAnswer>;
  generateMockInterviewQuestions?: Maybe<GeneratedMockQuestions>;
  generateMockTalkingPoints?: Maybe<GeneratedTalkingPoints>;
  generateResume?: Maybe<DocumentDraft>;
  importCvProfile?: Maybe<ImportCvProfileResult>;
  importUserData?: Maybe<ImportSummary>;
  login?: Maybe<LoginResult>;
  loginMobile?: Maybe<MobileLoginResult>;
  loginWithTotp?: Maybe<Scalars['String']['output']>;
  loginWithTotpMobile?: Maybe<MobileAuthPayload>;
  logout?: Maybe<Scalars['Boolean']['output']>;
  markNotificationsRead?: Maybe<Scalars['Boolean']['output']>;
  /** Place a card in a kanban column. Returns the destination column in its new order. */
  moveApplicationOnBoard?: Maybe<Array<JobApplication>>;
  parseJobDescription?: Maybe<ParsedJobDescription>;
  permanentlyDeleteApplication?: Maybe<Scalars['Boolean']['output']>;
  /** Rewords the text the editor holds (which may be unsaved) and returns it as markdown. Saves nothing. */
  polishDocumentDraft: PolishDocumentDraftResult;
  rateAiOutput?: Maybe<AiRating>;
  reauthenticate?: Maybe<LoginResult>;
  reauthenticateMobile?: Maybe<MobileLoginResult>;
  recordCookieConsent?: Maybe<Scalars['Boolean']['output']>;
  refreshToken?: Maybe<Scalars['String']['output']>;
  refreshTokenMobile?: Maybe<MobileAuthPayload>;
  regenerateTotpBackupCodes?: Maybe<ConfirmTotpSetupResult>;
  register?: Maybe<Scalars['String']['output']>;
  registerExpoPushToken?: Maybe<Scalars['Boolean']['output']>;
  registerMobile?: Maybe<MobileAuthPayload>;
  registerPushSubscription?: Maybe<Scalars['Boolean']['output']>;
  removeAvatar?: Maybe<Scalars['Boolean']['output']>;
  removeBackupEmail?: Maybe<Scalars['Boolean']['output']>;
  renameDocumentDraft?: Maybe<DocumentDraft>;
  reorderInterviewQuestions?: Maybe<Array<InterviewQuestion>>;
  reorderMockInterviewQuestions?: Maybe<Array<MockInterviewQuestion>>;
  /** Mails a link that schedules this account for deletion. Needs a fresh session (STEP_UP_REQUIRED otherwise). */
  requestAccountDeletion?: Maybe<Scalars['Boolean']['output']>;
  requestAddBackupEmail?: Maybe<Scalars['Boolean']['output']>;
  requestAvatarUploadUrl?: Maybe<UploadUrlPayload>;
  requestBackupEmailRecovery?: Maybe<Scalars['Boolean']['output']>;
  requestEmailChange?: Maybe<Scalars['Boolean']['output']>;
  requestPasswordReset?: Maybe<Scalars['Boolean']['output']>;
  requestPasswordResetMobile?: Maybe<Scalars['Boolean']['output']>;
  /** Mails a 6-digit code to an account with no password, for `verifyStepUpCode`. */
  requestStepUpCode?: Maybe<Scalars['Boolean']['output']>;
  requestUploadUrl?: Maybe<UploadUrlPayload>;
  resendVerificationEmail?: Maybe<Scalars['Boolean']['output']>;
  resetPassword?: Maybe<Scalars['Boolean']['output']>;
  restoreApplication?: Maybe<Scalars['Boolean']['output']>;
  restoreDocumentDraftVersion?: Maybe<DocumentDraft>;
  revokeMcpOAuthGrant?: Maybe<Scalars['Boolean']['output']>;
  revokeOtherSessions?: Maybe<Scalars['Boolean']['output']>;
  revokeSession?: Maybe<Scalars['Boolean']['output']>;
  saveLlmApiKey?: Maybe<Scalars['Boolean']['output']>;
  /** Saves the providers AI calls try, first to last (JEF-503): 'trakwyn' and/or the ids of the user's own keys. Replaces setAiSource, setDefaultLlmProvider and the fall-through toggle. */
  setAiProviderOrder?: Maybe<Scalars['Boolean']['output']>;
  /**
   * Which key AI calls run on: 'auto', 'trakwyn' or 'own' (JEF-446).
   * @deprecated Use setAiProviderOrder (JEF-503). Kept for apps already in the stores.
   */
  setAiSource?: Maybe<Scalars['Boolean']['output']>;
  /** @deprecated Use setAiProviderOrder (JEF-503). Kept for apps already in the stores. */
  setDefaultLlmProvider?: Maybe<Scalars['Boolean']['output']>;
  setLlmApiKeyMonthlyLimit?: Maybe<Scalars['Boolean']['output']>;
  /** A short-lived ticket for `/auth/oauth/:provider/start?mode=reauth&ticket=…`, which refreshes this session once the provider signs the user in again. */
  startOAuthReauth?: Maybe<Scalars['String']['output']>;
  testLlmApiKey?: Maybe<TestLlmApiKeyResult>;
  unlinkOAuthAccount?: Maybe<Scalars['Boolean']['output']>;
  unregisterPushSubscription?: Maybe<Scalars['Boolean']['output']>;
  updateApplication?: Maybe<JobApplication>;
  updateAward?: Maybe<Award>;
  updateCertification?: Maybe<Certification>;
  updateContact?: Maybe<Contact>;
  updateDocumentDraftContent?: Maybe<DocumentDraft>;
  updateEducation?: Maybe<Education>;
  updateInterviewQuestion?: Maybe<InterviewQuestion>;
  updateInterviewRound?: Maybe<InterviewRound>;
  updateLanguage?: Maybe<Language>;
  updateMockInterviewQuestion?: Maybe<MockInterviewQuestion>;
  updateNote?: Maybe<Note>;
  updateNotificationPreferences?: Maybe<Scalars['Boolean']['output']>;
  updateOffer?: Maybe<Offer>;
  updatePassword?: Maybe<Scalars['Boolean']['output']>;
  updateProfile?: Maybe<Scalars['Boolean']['output']>;
  updateProject?: Maybe<Project>;
  updateSkill?: Maybe<Skill>;
  updateWorkExperience?: Maybe<WorkExperience>;
  verifyEmail?: Maybe<Scalars['Boolean']['output']>;
  /** Checks a mailed step-up code and refreshes the session cookies. */
  verifyStepUpCode?: Maybe<Scalars['Boolean']['output']>;
  /** `verifyStepUpCode` for clients with no cookie jar: the tokens come in the body. */
  verifyStepUpCodeMobile?: Maybe<MobileAuthPayload>;
};

export type MutationBeginTotpSetupArgs = {
  password: Scalars['String']['input'];
};

export type MutationBulkAddTagToApplicationsArgs = {
  ids: Array<Scalars['ID']['input']>;
  tag: Scalars['String']['input'];
};

export type MutationBulkDeleteApplicationsArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationBulkRestoreApplicationsArgs = {
  ids: Array<Scalars['ID']['input']>;
};

export type MutationBulkUpdateApplicationsArgs = {
  ids: Array<Scalars['ID']['input']>;
  starred?: InputMaybe<Scalars['Boolean']['input']>;
  status?: InputMaybe<ApplicationStatus>;
};

export type MutationCancelAccountDeletionArgs = {
  token?: InputMaybe<Scalars['String']['input']>;
};

export type MutationClearAiOutputRatingArgs = {
  targetId: Scalars['ID']['input'];
  targetKind: AiFeedbackTarget;
};

export type MutationCompareOffersArgs = {
  offerIds: Array<Scalars['String']['input']>;
};

export type MutationCompleteOnboardingArgs = {
  goals: Array<OnboardingGoal>;
};

export type MutationComputeResumeAtsScoreArgs = {
  documentDraftId?: InputMaybe<Scalars['ID']['input']>;
  documentId?: InputMaybe<Scalars['ID']['input']>;
};

export type MutationComputeResumeMatchScoreArgs = {
  applicationId: Scalars['ID']['input'];
  documentDraftId?: InputMaybe<Scalars['ID']['input']>;
  documentId?: InputMaybe<Scalars['ID']['input']>;
};

export type MutationConfirmAccountDeletionArgs = {
  token: Scalars['String']['input'];
};

export type MutationConfirmAvatarArgs = {
  mimeType: Scalars['String']['input'];
  sizeBytes: Scalars['Int']['input'];
  storageKey: Scalars['String']['input'];
};

export type MutationConfirmBackupEmailArgs = {
  token: Scalars['String']['input'];
};

export type MutationConfirmChatActionArgs = {
  id: Scalars['ID']['input'];
};

export type MutationConfirmDocumentArgs = {
  input: ConfirmDocumentInput;
};

export type MutationConfirmEmailChangeArgs = {
  token: Scalars['String']['input'];
};

export type MutationConfirmTotpSetupArgs = {
  code: Scalars['String']['input'];
};

export type MutationCreateApiTokenArgs = {
  name: Scalars['String']['input'];
  scope?: InputMaybe<ApiTokenScope>;
};

export type MutationCreateApplicationArgs = {
  input: CreateApplicationInput;
};

export type MutationCreateAwardArgs = {
  input: CreateAwardInput;
};

export type MutationCreateCertificationArgs = {
  input: CreateCertificationInput;
};

export type MutationCreateCheckoutSessionArgs = {
  plan: CheckoutPlan;
};

export type MutationCreateContactArgs = {
  applicationId: Scalars['ID']['input'];
  email?: InputMaybe<Scalars['String']['input']>;
  linkedinUrl?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
};

export type MutationCreateConversationArgs = {
  model?: InputMaybe<Scalars['String']['input']>;
  provider?: InputMaybe<Scalars['String']['input']>;
};

export type MutationCreateDocumentDraftArgs = {
  input: CreateDocumentDraftInput;
};

export type MutationCreateDocumentDraftVersionArgs = {
  draftId: Scalars['ID']['input'];
};

export type MutationCreateEducationArgs = {
  input: CreateEducationInput;
};

export type MutationCreateInterviewQuestionArgs = {
  input: CreateInterviewQuestionInput;
};

export type MutationCreateInterviewRoundArgs = {
  input: CreateInterviewRoundInput;
};

export type MutationCreateLanguageArgs = {
  input: CreateLanguageInput;
};

export type MutationCreateMockInterviewQuestionArgs = {
  input: CreateMockInterviewQuestionInput;
};

export type MutationCreateNoteArgs = {
  applicationId: Scalars['ID']['input'];
  content: Scalars['String']['input'];
};

export type MutationCreateOfferArgs = {
  input: CreateOfferInput;
};

export type MutationCreateProjectArgs = {
  input: CreateProjectInput;
};

export type MutationCreateShareLinkArgs = {
  name: Scalars['String']['input'];
};

export type MutationCreateSkillArgs = {
  input: CreateSkillInput;
};

export type MutationCreateWorkExperienceArgs = {
  input: CreateWorkExperienceInput;
};

export type MutationDeleteAccountArgs = {
  password: Scalars['String']['input'];
};

export type MutationDeleteApiTokenArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteApplicationArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteAwardArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteCertificationArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteContactArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteConversationArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteDocumentArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteDocumentDraftArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteEducationArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteInterviewQuestionArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteInterviewRoundArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteLanguageArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteLlmApiKeyArgs = {
  provider: Scalars['String']['input'];
};

export type MutationDeleteMockInterviewQuestionArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteNoteArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteOfferArgs = {
  id: Scalars['String']['input'];
};

export type MutationDeleteProjectArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteShareLinkArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteSkillArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteWorkExperienceArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDisableTotpArgs = {
  password: Scalars['String']['input'];
};

export type MutationDismissChatActionArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDismissResumeGapArgs = {
  applicationId: Scalars['ID']['input'];
  key: Scalars['String']['input'];
};

export type MutationExchangeMobileOAuthCodeArgs = {
  code: Scalars['String']['input'];
  codeVerifier: Scalars['String']['input'];
};

export type MutationExportDocumentDraftToPdfArgs = {
  draftId: Scalars['ID']['input'];
};

export type MutationExtractDocumentTextArgs = {
  documentId: Scalars['ID']['input'];
};

export type MutationExtractPostingRequirementsArgs = {
  applicationId: Scalars['ID']['input'];
};

export type MutationGenerateCompanyBriefingArgs = {
  applicationId: Scalars['ID']['input'];
  instructions?: InputMaybe<Scalars['String']['input']>;
};

export type MutationGenerateCoverLetterArgs = {
  applicationId: Scalars['ID']['input'];
  resumeDocumentId?: InputMaybe<Scalars['ID']['input']>;
  resumeDraftId?: InputMaybe<Scalars['ID']['input']>;
  resumeText?: InputMaybe<Scalars['String']['input']>;
};

export type MutationGenerateIntoDocumentDraftArgs = {
  draftId: Scalars['ID']['input'];
  instructions?: InputMaybe<Scalars['String']['input']>;
  resumeDocumentId?: InputMaybe<Scalars['ID']['input']>;
  resumeDraftId?: InputMaybe<Scalars['ID']['input']>;
};

export type MutationGenerateMockInterviewAnswerArgs = {
  documentId?: InputMaybe<Scalars['ID']['input']>;
  mockInterviewQuestionId: Scalars['ID']['input'];
  prompt?: InputMaybe<Scalars['String']['input']>;
  useProfile?: InputMaybe<Scalars['Boolean']['input']>;
};

export type MutationGenerateMockInterviewQuestionsArgs = {
  count?: InputMaybe<Scalars['Int']['input']>;
  documentId?: InputMaybe<Scalars['ID']['input']>;
  interviewRoundId: Scalars['ID']['input'];
  prompt?: InputMaybe<Scalars['String']['input']>;
  useProfile?: InputMaybe<Scalars['Boolean']['input']>;
};

export type MutationGenerateMockTalkingPointsArgs = {
  documentId?: InputMaybe<Scalars['ID']['input']>;
  mockInterviewQuestionId: Scalars['ID']['input'];
  prompt?: InputMaybe<Scalars['String']['input']>;
  useProfile?: InputMaybe<Scalars['Boolean']['input']>;
};

export type MutationGenerateResumeArgs = {
  applicationId: Scalars['ID']['input'];
};

export type MutationImportCvProfileArgs = {
  input: ImportCvProfileInput;
};

export type MutationImportUserDataArgs = {
  data: Scalars['String']['input'];
};

export type MutationLoginArgs = {
  captchaToken?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type MutationLoginMobileArgs = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type MutationLoginWithTotpArgs = {
  code: Scalars['String']['input'];
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type MutationLoginWithTotpMobileArgs = {
  code: Scalars['String']['input'];
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type MutationMarkNotificationsReadArgs = {
  ids: Array<Scalars['ID']['input']>;
  isRead: Scalars['Boolean']['input'];
};

export type MutationMoveApplicationOnBoardArgs = {
  input: MoveApplicationOnBoardInput;
};

export type MutationParseJobDescriptionArgs = {
  text?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
};

export type MutationPermanentlyDeleteApplicationArgs = {
  id: Scalars['ID']['input'];
};

export type MutationPolishDocumentDraftArgs = {
  draftId: Scalars['ID']['input'];
  instructions?: InputMaybe<Scalars['String']['input']>;
  plainText: Scalars['String']['input'];
};

export type MutationRateAiOutputArgs = {
  rating: AiFeedbackRating;
  reason?: InputMaybe<AiFeedbackReason>;
  targetId: Scalars['ID']['input'];
  targetKind: AiFeedbackTarget;
};

export type MutationReauthenticateArgs = {
  code?: InputMaybe<Scalars['String']['input']>;
  password: Scalars['String']['input'];
};

export type MutationReauthenticateMobileArgs = {
  code?: InputMaybe<Scalars['String']['input']>;
  password: Scalars['String']['input'];
};

export type MutationRecordCookieConsentArgs = {
  analyticsAccepted: Scalars['Boolean']['input'];
};

export type MutationRefreshTokenMobileArgs = {
  refreshToken: Scalars['String']['input'];
};

export type MutationRegenerateTotpBackupCodesArgs = {
  currentPassword: Scalars['String']['input'];
};

export type MutationRegisterArgs = {
  captchaToken?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type MutationRegisterExpoPushTokenArgs = {
  token: Scalars['String']['input'];
};

export type MutationRegisterMobileArgs = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type MutationRegisterPushSubscriptionArgs = {
  auth: Scalars['String']['input'];
  endpoint: Scalars['String']['input'];
  p256dh: Scalars['String']['input'];
};

export type MutationRemoveBackupEmailArgs = {
  currentPassword?: InputMaybe<Scalars['String']['input']>;
};

export type MutationRenameDocumentDraftArgs = {
  draftId: Scalars['ID']['input'];
  title: Scalars['String']['input'];
};

export type MutationReorderInterviewQuestionsArgs = {
  interviewRoundId: Scalars['ID']['input'];
  orderedIds: Array<Scalars['ID']['input']>;
};

export type MutationReorderMockInterviewQuestionsArgs = {
  interviewRoundId: Scalars['ID']['input'];
  orderedIds: Array<Scalars['ID']['input']>;
};

export type MutationRequestAddBackupEmailArgs = {
  backupEmail: Scalars['String']['input'];
  currentPassword?: InputMaybe<Scalars['String']['input']>;
};

export type MutationRequestAvatarUploadUrlArgs = {
  filename: Scalars['String']['input'];
  mimeType: Scalars['String']['input'];
};

export type MutationRequestBackupEmailRecoveryArgs = {
  backupEmail: Scalars['String']['input'];
};

export type MutationRequestEmailChangeArgs = {
  currentPassword?: InputMaybe<Scalars['String']['input']>;
  newEmail: Scalars['String']['input'];
};

export type MutationRequestPasswordResetArgs = {
  captchaToken?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
};

export type MutationRequestPasswordResetMobileArgs = {
  email: Scalars['String']['input'];
};

export type MutationRequestUploadUrlArgs = {
  input: RequestUploadUrlInput;
};

export type MutationResetPasswordArgs = {
  newPassword: Scalars['String']['input'];
  token: Scalars['String']['input'];
};

export type MutationRestoreApplicationArgs = {
  id: Scalars['ID']['input'];
};

export type MutationRestoreDocumentDraftVersionArgs = {
  versionId: Scalars['ID']['input'];
};

export type MutationRevokeMcpOAuthGrantArgs = {
  id: Scalars['ID']['input'];
};

export type MutationRevokeSessionArgs = {
  id: Scalars['ID']['input'];
};

export type MutationSaveLlmApiKeyArgs = {
  apiKey: Scalars['String']['input'];
  baseUrl?: InputMaybe<Scalars['String']['input']>;
  model?: InputMaybe<Scalars['String']['input']>;
  provider: Scalars['String']['input'];
};

export type MutationSetAiProviderOrderArgs = {
  order: Array<Scalars['String']['input']>;
};

export type MutationSetAiSourceArgs = {
  aiSource: Scalars['String']['input'];
};

export type MutationSetDefaultLlmProviderArgs = {
  provider: Scalars['String']['input'];
};

export type MutationSetLlmApiKeyMonthlyLimitArgs = {
  monthlyTokenLimit?: InputMaybe<Scalars['Int']['input']>;
  provider: Scalars['String']['input'];
};

export type MutationStartOAuthReauthArgs = {
  provider: OAuthProvider;
};

export type MutationTestLlmApiKeyArgs = {
  apiKey?: InputMaybe<Scalars['String']['input']>;
  baseUrl?: InputMaybe<Scalars['String']['input']>;
  model?: InputMaybe<Scalars['String']['input']>;
  provider: Scalars['String']['input'];
};

export type MutationUnlinkOAuthAccountArgs = {
  provider: OAuthProvider;
};

export type MutationUnregisterPushSubscriptionArgs = {
  endpoint: Scalars['String']['input'];
};

export type MutationUpdateApplicationArgs = {
  id: Scalars['ID']['input'];
  input: UpdateApplicationInput;
};

export type MutationUpdateAwardArgs = {
  id: Scalars['ID']['input'];
  input: UpdateAwardInput;
};

export type MutationUpdateCertificationArgs = {
  id: Scalars['ID']['input'];
  input: UpdateCertificationInput;
};

export type MutationUpdateContactArgs = {
  email?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  linkedinUrl?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
};

export type MutationUpdateDocumentDraftContentArgs = {
  input: UpdateDocumentDraftContentInput;
};

export type MutationUpdateEducationArgs = {
  id: Scalars['ID']['input'];
  input: UpdateEducationInput;
};

export type MutationUpdateInterviewQuestionArgs = {
  id: Scalars['ID']['input'];
  input: UpdateInterviewQuestionInput;
};

export type MutationUpdateInterviewRoundArgs = {
  id: Scalars['ID']['input'];
  input: UpdateInterviewRoundInput;
};

export type MutationUpdateLanguageArgs = {
  id: Scalars['ID']['input'];
  input: UpdateLanguageInput;
};

export type MutationUpdateMockInterviewQuestionArgs = {
  id: Scalars['ID']['input'];
  input: UpdateMockInterviewQuestionInput;
};

export type MutationUpdateNoteArgs = {
  content: Scalars['String']['input'];
  id: Scalars['ID']['input'];
};

export type MutationUpdateNotificationPreferencesArgs = {
  digestFrequency?: InputMaybe<DigestFrequency>;
  followUpRemindersEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  pushNotificationsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  weeklyApplicationGoal?: InputMaybe<Scalars['Int']['input']>;
  weeklyDigestEnabled?: InputMaybe<Scalars['Boolean']['input']>;
};

export type MutationUpdateOfferArgs = {
  input: UpdateOfferInput;
};

export type MutationUpdatePasswordArgs = {
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
};

export type MutationUpdateProfileArgs = {
  customAiPrompt?: InputMaybe<Scalars['String']['input']>;
  llmFallbackWhenLimited?: InputMaybe<Scalars['Boolean']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  profileLinks?: InputMaybe<Array<Scalars['String']['input']>>;
  targetRole?: InputMaybe<Scalars['String']['input']>;
  timezone?: InputMaybe<Scalars['String']['input']>;
  useCrossApplicationContext?: InputMaybe<Scalars['Boolean']['input']>;
};

export type MutationUpdateProjectArgs = {
  id: Scalars['ID']['input'];
  input: UpdateProjectInput;
};

export type MutationUpdateSkillArgs = {
  id: Scalars['ID']['input'];
  input: UpdateSkillInput;
};

export type MutationUpdateWorkExperienceArgs = {
  id: Scalars['ID']['input'];
  input: UpdateWorkExperienceInput;
};

export type MutationVerifyEmailArgs = {
  token: Scalars['String']['input'];
};

export type MutationVerifyStepUpCodeArgs = {
  code: Scalars['String']['input'];
};

export type MutationVerifyStepUpCodeMobileArgs = {
  code: Scalars['String']['input'];
};

export type Note = {
  __typename?: 'Note';
  applicationId?: Maybe<Scalars['ID']['output']>;
  content?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type Notification = {
  __typename?: 'Notification';
  body?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  read?: Maybe<Scalars['Boolean']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type NotificationConnection = {
  __typename?: 'NotificationConnection';
  hasNextPage?: Maybe<Scalars['Boolean']['output']>;
  items?: Maybe<Array<Notification>>;
  nextCursor?: Maybe<Scalars['String']['output']>;
};

export type NotificationPreferences = {
  __typename?: 'NotificationPreferences';
  digestFrequency?: Maybe<Scalars['String']['output']>;
  followUpRemindersEnabled?: Maybe<Scalars['Boolean']['output']>;
  pushNotificationsEnabled?: Maybe<Scalars['Boolean']['output']>;
  weeklyApplicationGoal?: Maybe<Scalars['Int']['output']>;
  weeklyDigestEnabled?: Maybe<Scalars['Boolean']['output']>;
};

export type OAuthProvider = 'github' | 'google';

export type Offer = {
  __typename?: 'Offer';
  applicationId?: Maybe<Scalars['ID']['output']>;
  baseSalary?: Maybe<Scalars['Int']['output']>;
  benefits?: Maybe<Scalars['String']['output']>;
  bonus?: Maybe<Scalars['Int']['output']>;
  costOfLivingAdjustment?: Maybe<Scalars['Int']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  currency?: Maybe<Scalars['String']['output']>;
  equity?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  notes?: Maybe<Scalars['String']['output']>;
  period?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
};

export type OfferAnalytics = {
  __typename?: 'OfferAnalytics';
  byCurrency?: Maybe<Array<CurrencyGroupStat>>;
  trend?: Maybe<Array<OfferTrendPoint>>;
};

export type OfferComparison = {
  __typename?: 'OfferComparison';
  company?: Maybe<Scalars['String']['output']>;
  normalizedYearlySalary?: Maybe<Scalars['Int']['output']>;
  offer?: Maybe<Offer>;
  role?: Maybe<Scalars['String']['output']>;
  totalCompensation?: Maybe<Scalars['Int']['output']>;
};

export type OfferTrendPoint = {
  __typename?: 'OfferTrendPoint';
  applicationId?: Maybe<Scalars['ID']['output']>;
  company?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  currency?: Maybe<Scalars['String']['output']>;
  normalizedYearlySalary?: Maybe<Scalars['Float']['output']>;
  offerId?: Maybe<Scalars['ID']['output']>;
  role?: Maybe<Scalars['String']['output']>;
};

export type OfferWithApplication = {
  __typename?: 'OfferWithApplication';
  company?: Maybe<Scalars['String']['output']>;
  offer?: Maybe<Offer>;
  role?: Maybe<Scalars['String']['output']>;
};

export type OnboardingGoal = 'AI_DOCUMENTS' | 'ASSISTANT' | 'MCP' | 'TRACK_APPLICATIONS';

export type ParsedJobDescription = {
  __typename?: 'ParsedJobDescription';
  company?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  location?: Maybe<Scalars['String']['output']>;
  /** The posting as written, for the application's postingText field. */
  postingText?: Maybe<Scalars['String']['output']>;
  role?: Maybe<Scalars['String']['output']>;
  salary?: Maybe<Scalars['String']['output']>;
};

export type Plan = 'free' | 'pro';

/** Both plans side by side, whichever one the user is on. */
export type PlanCatalogue = {
  __typename?: 'PlanCatalogue';
  free?: Maybe<PlanTerms>;
  pro?: Maybe<PlanTerms>;
};

/** The Pro-only capabilities, on or off for this user. */
export type PlanFeatures = {
  __typename?: 'PlanFeatures';
  analytics?: Maybe<Scalars['Boolean']['output']>;
  /** The GraphQL API with an API token. MCP access is `mcpAccess`. */
  apiAccess?: Maybe<Scalars['Boolean']['output']>;
  mcpAccess?: Maybe<Scalars['Boolean']['output']>;
  notifications?: Maybe<Scalars['Boolean']['output']>;
  offers?: Maybe<Scalars['Boolean']['output']>;
  shareLinks?: Maybe<Scalars['Boolean']['output']>;
};

/** What the user may hold. Null means no limit. */
export type PlanLimits = {
  __typename?: 'PlanLimits';
  aiCreditsPerMonth?: Maybe<Scalars['Int']['output']>;
  applications?: Maybe<Scalars['Int']['output']>;
  documentBytes?: Maybe<Scalars['Float']['output']>;
};

export type PlanSource = 'grant' | 'pass' | 'subscription' | 'trial';

/** What one plan includes. */
export type PlanTerms = {
  __typename?: 'PlanTerms';
  features?: Maybe<PlanFeatures>;
  limits?: Maybe<PlanLimits>;
};

/** How much of each limit the user has used. */
export type PlanUsage = {
  __typename?: 'PlanUsage';
  applications?: Maybe<Scalars['Int']['output']>;
  documentBytes?: Maybe<Scalars['Float']['output']>;
};

export type PolishDocumentDraftResult = {
  __typename?: 'PolishDocumentDraftResult';
  markdown: Scalars['String']['output'];
};

/** What an application’s job posting asks for, read from its text by AI. */
export type PostingRequirements = {
  __typename?: 'PostingRequirements';
  applicationId?: Maybe<Scalars['ID']['output']>;
  generatedAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  isStale?: Maybe<Scalars['Boolean']['output']>;
  keywords?: Maybe<Array<Scalars['String']['output']>>;
  mustHave?: Maybe<Array<Scalars['String']['output']>>;
  niceToHave?: Maybe<Array<Scalars['String']['output']>>;
  seniority?: Maybe<Scalars['String']['output']>;
};

export type Project = {
  __typename?: 'Project';
  createdAt?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  endDate?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  role?: Maybe<Scalars['String']['output']>;
  startDate?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['ID']['output']>;
};

export type Query = {
  __typename?: 'Query';
  activityLogs?: Maybe<Array<ActivityLog>>;
  apiTokens?: Maybe<Array<ApiToken>>;
  application?: Maybe<JobApplication>;
  applicationChannelAnalytics?: Maybe<ApplicationChannelAnalytics>;
  applicationHealthScore?: Maybe<ApplicationHealthScore>;
  applications?: Maybe<Array<JobApplication>>;
  applicationsPage?: Maybe<ApplicationConnection>;
  awards?: Maybe<Array<Award>>;
  /** Where the signed-in user stands against their plan's limits. */
  billingStatus?: Maybe<BillingStatus>;
  calendarEvents?: Maybe<Array<CalendarEvent>>;
  certifications?: Maybe<Array<Certification>>;
  chatHistory?: Maybe<Array<Message>>;
  companyBriefing?: Maybe<CompanyBriefing>;
  contacts?: Maybe<Array<Contact>>;
  /** The limits on what the signed-in user can add, and how much of each per-user limit they have used (JEF-339). */
  contentQuota?: Maybe<ContentQuota>;
  conversations?: Maybe<Array<Conversation>>;
  documentDraft?: Maybe<DocumentDraft>;
  documentDraftVersion?: Maybe<DocumentDraftVersion>;
  documentDraftVersions?: Maybe<Array<DocumentDraftVersion>>;
  documentDrafts?: Maybe<Array<DocumentDraft>>;
  documentVersionOutcomes?: Maybe<Array<DocumentVersionOutcome>>;
  documents?: Maybe<Array<Document>>;
  educations?: Maybe<Array<Education>>;
  exportUserData?: Maybe<Scalars['String']['output']>;
  interviewQuestions?: Maybe<Array<InterviewQuestion>>;
  interviewRoundAnalytics?: Maybe<InterviewRoundAnalytics>;
  interviewRounds?: Maybe<Array<InterviewRound>>;
  languages?: Maybe<Array<Language>>;
  linkedOAuthAccounts?: Maybe<Array<LinkedOAuthAccount>>;
  llmApiKeys?: Maybe<Array<LlmApiKey>>;
  llmUsageSummary?: Maybe<Array<LlmUsageSummary>>;
  loginHistory?: Maybe<Array<LoginEvent>>;
  mcpOAuthGrants?: Maybe<Array<McpOAuthGrant>>;
  me?: Maybe<User>;
  mockInterviewQuestions?: Maybe<Array<MockInterviewQuestion>>;
  myOffers?: Maybe<Array<OfferWithApplication>>;
  notes?: Maybe<Array<Note>>;
  notificationPreferences?: Maybe<NotificationPreferences>;
  notificationsPage?: Maybe<NotificationConnection>;
  offerAnalytics?: Maybe<OfferAnalytics>;
  offers?: Maybe<Array<Offer>>;
  /** The saved requirements for an application’s posting, or null when it has not been read. Never calls AI. */
  postingRequirements?: Maybe<PostingRequirements>;
  projects?: Maybe<Array<Project>>;
  responseTimeAnalytics?: Maybe<ResponseTimeAnalytics>;
  resumeAtsScores?: Maybe<Array<AtsScore>>;
  /** What would strengthen a resume for this application. Never calls AI. */
  resumeGaps?: Maybe<ResumeGaps>;
  resumeMatches?: Maybe<Array<ResumeMatch>>;
  searchConversations?: Maybe<Array<Conversation>>;
  securityActivity?: Maybe<Array<SecurityActivityItem>>;
  sessions?: Maybe<Array<Session>>;
  shareLinks?: Maybe<Array<ShareLink>>;
  sharedSummary?: Maybe<SharedSummary>;
  skills?: Maybe<Array<Skill>>;
  totpEnabled?: Maybe<Scalars['Boolean']['output']>;
  trashedApplications?: Maybe<Array<JobApplication>>;
  unreadNotificationCount?: Maybe<Scalars['Int']['output']>;
  weeklyApplicationGoal?: Maybe<WeeklyApplicationGoal>;
  workExperiences?: Maybe<Array<WorkExperience>>;
};

export type QueryActivityLogsArgs = {
  applicationId: Scalars['ID']['input'];
};

export type QueryApplicationArgs = {
  id: Scalars['ID']['input'];
};

export type QueryApplicationHealthScoreArgs = {
  applicationId: Scalars['ID']['input'];
};

export type QueryApplicationsArgs = {
  status?: InputMaybe<ApplicationStatus>;
};

export type QueryApplicationsPageArgs = {
  cursor?: InputMaybe<Scalars['String']['input']>;
  likelyGhosted?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  starred?: InputMaybe<Scalars['Boolean']['input']>;
  status?: InputMaybe<ApplicationStatus>;
};

export type QueryChatHistoryArgs = {
  conversationId: Scalars['ID']['input'];
};

export type QueryCompanyBriefingArgs = {
  applicationId: Scalars['ID']['input'];
};

export type QueryContactsArgs = {
  applicationId: Scalars['ID']['input'];
};

export type QueryConversationsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryDocumentDraftArgs = {
  id: Scalars['ID']['input'];
};

export type QueryDocumentDraftVersionArgs = {
  id: Scalars['ID']['input'];
};

export type QueryDocumentDraftVersionsArgs = {
  draftId: Scalars['ID']['input'];
};

export type QueryDocumentDraftsArgs = {
  applicationId: Scalars['ID']['input'];
};

export type QueryDocumentsArgs = {
  applicationId: Scalars['ID']['input'];
};

export type QueryInterviewQuestionsArgs = {
  interviewRoundId: Scalars['ID']['input'];
};

export type QueryInterviewRoundsArgs = {
  applicationId: Scalars['ID']['input'];
};

export type QueryMockInterviewQuestionsArgs = {
  interviewRoundId: Scalars['ID']['input'];
};

export type QueryNotesArgs = {
  applicationId: Scalars['ID']['input'];
};

export type QueryNotificationsPageArgs = {
  cursor?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryOffersArgs = {
  applicationId: Scalars['ID']['input'];
};

export type QueryPostingRequirementsArgs = {
  applicationId: Scalars['ID']['input'];
};

export type QueryResumeAtsScoresArgs = {
  applicationId: Scalars['ID']['input'];
};

export type QueryResumeGapsArgs = {
  applicationId: Scalars['ID']['input'];
};

export type QueryResumeMatchesArgs = {
  applicationId: Scalars['ID']['input'];
};

export type QuerySearchConversationsArgs = {
  query: Scalars['String']['input'];
};

export type QuerySharedSummaryArgs = {
  token: Scalars['String']['input'];
};

export type RequestUploadUrlInput = {
  applicationId: Scalars['ID']['input'];
  filename: Scalars['String']['input'];
  mimeType: Scalars['String']['input'];
  sizeBytes?: InputMaybe<Scalars['Int']['input']>;
};

export type ResponseTimeAnalytics = {
  __typename?: 'ResponseTimeAnalytics';
  timeInStage?: Maybe<Array<StageDurationStat>>;
  timeToFirstResponse?: Maybe<TimeToResponseStat>;
};

/** Questions that would strengthen a resume for an application: what the posting asks for that the profile does not show, and roles with no numbers. */
export type ResumeGaps = {
  __typename?: 'ResumeGaps';
  requirementGaps?: Maybe<Array<Scalars['String']['output']>>;
  /** False when the posting’s requirements have not been read yet. */
  requirementsRead?: Maybe<Scalars['Boolean']['output']>;
  rolesWithoutMetrics?: Maybe<Array<RoleWithoutMetrics>>;
};

export type ResumeMatch = {
  __typename?: 'ResumeMatch';
  applicationId?: Maybe<Scalars['ID']['output']>;
  documentDraftId?: Maybe<Scalars['ID']['output']>;
  documentId?: Maybe<Scalars['ID']['output']>;
  generatedAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  isStale?: Maybe<Scalars['Boolean']['output']>;
  label?: Maybe<Scalars['String']['output']>;
  matchedKeywords?: Maybe<Array<Scalars['String']['output']>>;
  missingKeywords?: Maybe<Array<Scalars['String']['output']>>;
  score?: Maybe<Scalars['Int']['output']>;
  summary?: Maybe<Scalars['String']['output']>;
};

/** A work experience whose description holds no number. */
export type RoleWithoutMetrics = {
  __typename?: 'RoleWithoutMetrics';
  company?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  workExperienceId?: Maybe<Scalars['ID']['output']>;
};

export type RoundsToTerminalStat = {
  __typename?: 'RoundsToTerminalStat';
  average?: Maybe<Scalars['Float']['output']>;
  median?: Maybe<Scalars['Float']['output']>;
  sampleSize?: Maybe<Scalars['Int']['output']>;
};

export type SecurityActivityItem = {
  __typename?: 'SecurityActivityItem';
  createdAt?: Maybe<Scalars['String']['output']>;
  eventType?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['String']['output']>;
  ipAddress?: Maybe<Scalars['String']['output']>;
  userAgent?: Maybe<Scalars['String']['output']>;
};

export type Session = {
  __typename?: 'Session';
  createdAt?: Maybe<Scalars['String']['output']>;
  current?: Maybe<Scalars['Boolean']['output']>;
  deviceLabel?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  ipAddress?: Maybe<Scalars['String']['output']>;
  lastUsedAt?: Maybe<Scalars['String']['output']>;
  location?: Maybe<Scalars['String']['output']>;
  userAgent?: Maybe<Scalars['String']['output']>;
};

export type ShareLink = {
  __typename?: 'ShareLink';
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  lastUsedAt?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
};

export type SharedSummary = {
  __typename?: 'SharedSummary';
  applicationsUpdatedLast7Days?: Maybe<Scalars['Int']['output']>;
  generatedAt?: Maybe<Scalars['String']['output']>;
  statusCounts?: Maybe<Array<StatusCount>>;
  totalApplications?: Maybe<Scalars['Int']['output']>;
  totalInterviews?: Maybe<Scalars['Int']['output']>;
  upcomingInterviews?: Maybe<Scalars['Int']['output']>;
};

export type Skill = {
  __typename?: 'Skill';
  category?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  proficiency?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['ID']['output']>;
};

export type StageDurationStat = {
  __typename?: 'StageDurationStat';
  averageDays?: Maybe<Scalars['Float']['output']>;
  medianDays?: Maybe<Scalars['Float']['output']>;
  sampleSize?: Maybe<Scalars['Int']['output']>;
  status?: Maybe<ApplicationStatus>;
};

export type StatusCount = {
  __typename?: 'StatusCount';
  count?: Maybe<Scalars['Int']['output']>;
  status?: Maybe<ApplicationStatus>;
};

export type StepUpMethod = 'email_code' | 'github' | 'google' | 'password';

export type TestLlmApiKeyResult = {
  __typename?: 'TestLlmApiKeyResult';
  error?: Maybe<Scalars['String']['output']>;
  ok?: Maybe<Scalars['Boolean']['output']>;
};

export type TimeToResponseStat = {
  __typename?: 'TimeToResponseStat';
  averageDays?: Maybe<Scalars['Float']['output']>;
  medianDays?: Maybe<Scalars['Float']['output']>;
  sampleSize?: Maybe<Scalars['Int']['output']>;
};

export type TotpSetup = {
  __typename?: 'TotpSetup';
  otpauthUrl?: Maybe<Scalars['String']['output']>;
  qrCodeDataUrl?: Maybe<Scalars['String']['output']>;
  secret?: Maybe<Scalars['String']['output']>;
};

export type UpdateApplicationInput = {
  company?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  followUpAt?: InputMaybe<Scalars['String']['input']>;
  jobUrl?: InputMaybe<Scalars['String']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  postingText?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
  salaryRange?: InputMaybe<Scalars['String']['input']>;
  source?: InputMaybe<Scalars['String']['input']>;
  starred?: InputMaybe<Scalars['Boolean']['input']>;
  status?: InputMaybe<ApplicationStatus>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type UpdateAwardInput = {
  date?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  issuer?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCertificationInput = {
  credentialUrl?: InputMaybe<Scalars['String']['input']>;
  expiresAt?: InputMaybe<Scalars['String']['input']>;
  issuedAt?: InputMaybe<Scalars['String']['input']>;
  issuer?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateDocumentDraftContentInput = {
  aiInstructions?: InputMaybe<Scalars['String']['input']>;
  contentJson: Scalars['String']['input'];
  draftId: Scalars['ID']['input'];
  plainText: Scalars['String']['input'];
  replacedByAi?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UpdateEducationInput = {
  degree?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  field?: InputMaybe<Scalars['String']['input']>;
  institution?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateInterviewQuestionInput = {
  answer?: InputMaybe<Scalars['String']['input']>;
  question?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateInterviewRoundInput = {
  completedAt?: InputMaybe<Scalars['String']['input']>;
  interviewerName?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  outcome?: InputMaybe<InterviewRoundOutcome>;
  scheduledAt?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<InterviewRoundType>;
};

export type UpdateLanguageInput = {
  name?: InputMaybe<Scalars['String']['input']>;
  proficiency?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateMockInterviewQuestionInput = {
  answer?: InputMaybe<Scalars['String']['input']>;
  answerSource?: InputMaybe<AnswerSource>;
  question?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateOfferInput = {
  baseSalary?: InputMaybe<Scalars['Int']['input']>;
  benefits?: InputMaybe<Scalars['String']['input']>;
  bonus?: InputMaybe<Scalars['Int']['input']>;
  costOfLivingAdjustment?: InputMaybe<Scalars['Int']['input']>;
  currency?: InputMaybe<Scalars['String']['input']>;
  equity?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
  offerId: Scalars['ID']['input'];
  period?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateProjectInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateSkillInput = {
  category?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  proficiency?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateWorkExperienceInput = {
  company?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['String']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type UploadUrlPayload = {
  __typename?: 'UploadUrlPayload';
  access?: Maybe<Scalars['String']['output']>;
  storageKey?: Maybe<Scalars['String']['output']>;
  uploadUrl?: Maybe<Scalars['String']['output']>;
};

export type User = {
  __typename?: 'User';
  aiCredits?: Maybe<AiCredits>;
  /** The providers AI calls try, first to last (JEF-503): 'trakwyn' and/or the ids of the user's own keys. A call never runs on one that is not listed. */
  aiProviderOrder?: Maybe<Array<Scalars['String']['output']>>;
  /** @deprecated Use aiProviderOrder (JEF-503). Kept for apps already in the stores. */
  aiSource?: Maybe<Scalars['String']['output']>;
  avatarUrl?: Maybe<Scalars['String']['output']>;
  backupEmail?: Maybe<Scalars['String']['output']>;
  backupEmailVerifiedAt?: Maybe<Scalars['String']['output']>;
  customAiPrompt?: Maybe<Scalars['String']['output']>;
  /** @deprecated Use aiProviderOrder (JEF-503). Kept for apps already in the stores. */
  defaultLlmProvider?: Maybe<Scalars['String']['output']>;
  /** When the account will be deleted; null unless a deletion is scheduled (JEF-463). While set, only cancelling it is allowed. */
  deletionScheduledAt?: Maybe<Scalars['String']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  emailVerified?: Maybe<Scalars['Boolean']['output']>;
  /** False for an account created through Google or GitHub that never set one. */
  hasPassword?: Maybe<Scalars['Boolean']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  /** @deprecated Use aiProviderOrder (JEF-503). Kept for apps already in the stores. */
  llmFallbackWhenLimited?: Maybe<Scalars['Boolean']['output']>;
  location?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  onboardingChecklistDismissedAt?: Maybe<Scalars['String']['output']>;
  onboardingCompletedAt?: Maybe<Scalars['String']['output']>;
  onboardingGoals?: Maybe<Array<OnboardingGoal>>;
  phone?: Maybe<Scalars['String']['output']>;
  profileLinks?: Maybe<Array<Scalars['String']['output']>>;
  /** How this user confirms it is them before a sensitive change, in the order to offer them (JEF-463). */
  stepUpMethods?: Maybe<Array<StepUpMethod>>;
  storageLimitBytes?: Maybe<Scalars['Float']['output']>;
  storageUsedBytes?: Maybe<Scalars['Float']['output']>;
  targetRole?: Maybe<Scalars['String']['output']>;
  timezone?: Maybe<Scalars['String']['output']>;
  useCrossApplicationContext?: Maybe<Scalars['Boolean']['output']>;
};

export type WeeklyApplicationGoal = {
  __typename?: 'WeeklyApplicationGoal';
  currentWeekCount?: Maybe<Scalars['Int']['output']>;
  currentWeekStart?: Maybe<Scalars['String']['output']>;
  streakWeeks?: Maybe<Scalars['Int']['output']>;
  weeklyApplicationGoal?: Maybe<Scalars['Int']['output']>;
};

export type WorkExperience = {
  __typename?: 'WorkExperience';
  company?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  endDate?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  location?: Maybe<Scalars['String']['output']>;
  startDate?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['ID']['output']>;
};

export type UpdateApplicationMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateApplicationInput;
}>;

export type UpdateApplicationMutation = {
  __typename?: 'Mutation';
  updateApplication?: { __typename?: 'JobApplication'; id?: string | null } | null;
};

export type UpdateApplicationFlagsMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateApplicationInput;
}>;

export type UpdateApplicationFlagsMutation = {
  __typename?: 'Mutation';
  updateApplication?: {
    __typename?: 'JobApplication';
    id?: string | null;
    starred?: boolean | null;
    status?: ApplicationStatus | null;
  } | null;
};

export type ApplicationHealthScoreQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type ApplicationHealthScoreQuery = {
  __typename?: 'Query';
  applicationHealthScore?: {
    __typename?: 'ApplicationHealthScore';
    score?: number | null;
    label?: string | null;
    criteria?: Array<{
      __typename?: 'HealthScoreCriterion';
      key?: string | null;
      label?: string | null;
      points?: number | null;
      earned?: number | null;
      met?: boolean | null;
    }> | null;
  } | null;
};

export type ApplicationSectionCountsQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type ApplicationSectionCountsQuery = {
  __typename?: 'Query';
  application?: {
    __typename?: 'JobApplication';
    id?: string | null;
    sectionCounts?: {
      __typename?: 'ApplicationSectionCounts';
      notes?: number | null;
      interviews?: number | null;
      contacts?: number | null;
      offers?: number | null;
      companyBriefing?: boolean | null;
    } | null;
  } | null;
};

export type ActivityLogsQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type ActivityLogsQuery = {
  __typename?: 'Query';
  activityLogs?: Array<{
    __typename?: 'ActivityLog';
    id?: string | null;
    eventType?: string | null;
    payload?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type CompanyBriefingQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type CompanyBriefingQuery = {
  __typename?: 'Query';
  companyBriefing?: {
    __typename?: 'CompanyBriefing';
    id?: string | null;
    applicationId?: string | null;
    content?: string | null;
    generatedAt?: string | null;
    sources?: Array<{
      __typename?: 'CompanySource';
      url?: string | null;
      title?: string | null;
      publishedAt?: string | null;
    }> | null;
  } | null;
};

export type GenerateCompanyBriefingMutationVariables = Exact<{
  applicationId: Scalars['ID']['input'];
  instructions?: InputMaybe<Scalars['String']['input']>;
}>;

export type GenerateCompanyBriefingMutation = {
  __typename?: 'Mutation';
  generateCompanyBriefing?: {
    __typename?: 'CompanyBriefing';
    id?: string | null;
    applicationId?: string | null;
    content?: string | null;
    generatedAt?: string | null;
    sources?: Array<{
      __typename?: 'CompanySource';
      url?: string | null;
      title?: string | null;
      publishedAt?: string | null;
    }> | null;
  } | null;
};

export type ContactsQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type ContactsQuery = {
  __typename?: 'Query';
  contacts?: Array<{
    __typename?: 'Contact';
    id?: string | null;
    applicationId?: string | null;
    name?: string | null;
    role?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
    notes?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type CreateContactMutationVariables = Exact<{
  applicationId: Scalars['ID']['input'];
  name: Scalars['String']['input'];
  role?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  linkedinUrl?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
}>;

export type CreateContactMutation = {
  __typename?: 'Mutation';
  createContact?: {
    __typename?: 'Contact';
    id?: string | null;
    applicationId?: string | null;
    name?: string | null;
    role?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
    notes?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type UpdateContactMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  linkedinUrl?: InputMaybe<Scalars['String']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
}>;

export type UpdateContactMutation = {
  __typename?: 'Mutation';
  updateContact?: {
    __typename?: 'Contact';
    id?: string | null;
    applicationId?: string | null;
    name?: string | null;
    role?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
    notes?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type DeleteContactMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteContactMutation = { __typename?: 'Mutation'; deleteContact?: boolean | null };

export type ApplicationQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type ApplicationQuery = {
  __typename?: 'Query';
  application?: {
    __typename?: 'JobApplication';
    id?: string | null;
    company?: string | null;
    role?: string | null;
    status?: ApplicationStatus | null;
    jobUrl?: string | null;
    location?: string | null;
    salaryRange?: string | null;
    description?: string | null;
    postingText?: string | null;
    appliedAt?: string | null;
    starred?: boolean | null;
    source?: string | null;
    followUpAt?: string | null;
    tags?: Array<string> | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    deletedAt?: string | null;
    purgeAt?: string | null;
  } | null;
};

export type BulkUpdateApplicationMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateApplicationInput;
}>;

export type BulkUpdateApplicationMutation = {
  __typename?: 'Mutation';
  updateApplication?: { __typename?: 'JobApplication'; id?: string | null } | null;
};

export type CreateApplicationMutationVariables = Exact<{
  input: CreateApplicationInput;
}>;

export type CreateApplicationMutation = {
  __typename?: 'Mutation';
  createApplication?: { __typename?: 'JobApplication'; id?: string | null } | null;
};

export type ParseJobDescriptionMutationVariables = Exact<{
  text?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
}>;

export type ParseJobDescriptionMutation = {
  __typename?: 'Mutation';
  parseJobDescription?: {
    __typename?: 'ParsedJobDescription';
    company?: string | null;
    role?: string | null;
    location?: string | null;
    salary?: string | null;
    description?: string | null;
    postingText?: string | null;
  } | null;
};

export type DeleteApplicationMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteApplicationMutation = {
  __typename?: 'Mutation';
  deleteApplication?: boolean | null;
};

export type ApplicationsQueryVariables = Exact<{
  status?: InputMaybe<ApplicationStatus>;
}>;

export type ApplicationsQuery = {
  __typename?: 'Query';
  applications?: Array<{
    __typename?: 'JobApplication';
    id?: string | null;
    company?: string | null;
    role?: string | null;
    status?: ApplicationStatus | null;
    jobUrl?: string | null;
    location?: string | null;
    salaryRange?: string | null;
    appliedAt?: string | null;
    starred?: boolean | null;
    source?: string | null;
    followUpAt?: string | null;
    tags?: Array<string> | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type ApplicationsPageQueryVariables = Exact<{
  status?: InputMaybe<ApplicationStatus>;
  starred?: InputMaybe<Scalars['Boolean']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  cursor?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  likelyGhosted?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type ApplicationsPageQuery = {
  __typename?: 'Query';
  applicationsPage?: {
    __typename?: 'ApplicationConnection';
    hasNextPage?: boolean | null;
    nextCursor?: string | null;
    items?: Array<{
      __typename?: 'JobApplication';
      id?: string | null;
      company?: string | null;
      role?: string | null;
      status?: ApplicationStatus | null;
      location?: string | null;
      description?: string | null;
      appliedAt?: string | null;
      starred?: boolean | null;
      source?: string | null;
      followUpAt?: string | null;
      tags?: Array<string> | null;
      createdAt?: string | null;
    }> | null;
  } | null;
};

export type BoardApplicationsQueryVariables = Exact<{ [key: string]: never }>;

export type BoardApplicationsQuery = {
  __typename?: 'Query';
  applications?: Array<{
    __typename?: 'JobApplication';
    id?: string | null;
    company?: string | null;
    role?: string | null;
    status?: ApplicationStatus | null;
    location?: string | null;
    appliedAt?: string | null;
    starred?: boolean | null;
    createdAt?: string | null;
    tags?: Array<string> | null;
    likelyGhosted?: boolean | null;
    boardPosition?: number | null;
  }> | null;
};

export type MoveApplicationOnBoardMutationVariables = Exact<{
  input: MoveApplicationOnBoardInput;
}>;

export type MoveApplicationOnBoardMutation = {
  __typename?: 'Mutation';
  moveApplicationOnBoard?: Array<{
    __typename?: 'JobApplication';
    id?: string | null;
    status?: ApplicationStatus | null;
    boardPosition?: number | null;
  }> | null;
};

export type TrashedApplicationsQueryVariables = Exact<{ [key: string]: never }>;

export type TrashedApplicationsQuery = {
  __typename?: 'Query';
  trashedApplications?: Array<{
    __typename?: 'JobApplication';
    id?: string | null;
    company?: string | null;
    role?: string | null;
    status?: ApplicationStatus | null;
    location?: string | null;
    appliedAt?: string | null;
    deletedAt?: string | null;
    purgeAt?: string | null;
  }> | null;
};

export type RestoreApplicationMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type RestoreApplicationMutation = {
  __typename?: 'Mutation';
  restoreApplication?: boolean | null;
};

export type PermanentlyDeleteApplicationMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type PermanentlyDeleteApplicationMutation = {
  __typename?: 'Mutation';
  permanentlyDeleteApplication?: boolean | null;
};

export type BulkRestoreApplicationsMutationVariables = Exact<{
  ids: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;

export type BulkRestoreApplicationsMutation = {
  __typename?: 'Mutation';
  bulkRestoreApplications?: { __typename?: 'BulkRestoreResult'; restored?: number | null } | null;
};

export type EmptyTrashMutationVariables = Exact<{ [key: string]: never }>;

export type EmptyTrashMutation = {
  __typename?: 'Mutation';
  emptyTrash?: {
    __typename?: 'EmptyTrashResult';
    deleted?: number | null;
    failed?: number | null;
  } | null;
};

export type RegisterMutationVariables = Exact<{
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
  captchaToken?: InputMaybe<Scalars['String']['input']>;
}>;

export type RegisterMutation = { __typename?: 'Mutation'; register?: string | null };

export type LoginMutationVariables = Exact<{
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
  captchaToken?: InputMaybe<Scalars['String']['input']>;
}>;

export type LoginMutation = {
  __typename?: 'Mutation';
  login?: {
    __typename?: 'LoginResult';
    success?: boolean | null;
    totpRequired?: boolean | null;
    accessToken?: string | null;
  } | null;
};

export type LoginWithTotpMutationVariables = Exact<{
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
  code: Scalars['String']['input'];
}>;

export type LoginWithTotpMutation = { __typename?: 'Mutation'; loginWithTotp?: string | null };

export type RefreshTokenMutationVariables = Exact<{ [key: string]: never }>;

export type RefreshTokenMutation = { __typename?: 'Mutation'; refreshToken?: string | null };

export type LogoutMutationVariables = Exact<{ [key: string]: never }>;

export type LogoutMutation = { __typename?: 'Mutation'; logout?: boolean | null };

export type DashboardApplicationsQueryVariables = Exact<{ [key: string]: never }>;

export type DashboardApplicationsQuery = {
  __typename?: 'Query';
  applications?: Array<{
    __typename?: 'JobApplication';
    id?: string | null;
    company?: string | null;
    role?: string | null;
    status?: ApplicationStatus | null;
    starred?: boolean | null;
    followUpAt?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type DashboardCalendarEventsQueryVariables = Exact<{ [key: string]: never }>;

export type DashboardCalendarEventsQuery = {
  __typename?: 'Query';
  calendarEvents?: Array<{
    __typename?: 'CalendarEvent';
    id?: string | null;
    applicationId?: string | null;
    company?: string | null;
    role?: string | null;
    type?: CalendarEventType | null;
    date?: string | null;
    interviewRoundType?: InterviewRoundType | null;
  }> | null;
};

export type WeeklyApplicationGoalQueryVariables = Exact<{ [key: string]: never }>;

export type WeeklyApplicationGoalQuery = {
  __typename?: 'Query';
  weeklyApplicationGoal?: {
    __typename?: 'WeeklyApplicationGoal';
    weeklyApplicationGoal?: number | null;
    currentWeekCount?: number | null;
    currentWeekStart?: string | null;
    streakWeeks?: number | null;
  } | null;
};

export type OnboardingChecklistQueryVariables = Exact<{ [key: string]: never }>;

export type OnboardingChecklistQuery = {
  __typename?: 'Query';
  me?: {
    __typename?: 'User';
    onboardingChecklistDismissedAt?: string | null;
    onboardingGoals?: Array<OnboardingGoal> | null;
    aiCredits?: {
      __typename?: 'AiCredits';
      used?: number | null;
      limit?: number | null;
      bonusRemaining?: number | null;
    } | null;
  } | null;
  apiTokens?: Array<{ __typename?: 'ApiToken'; id?: string | null }> | null;
  llmApiKeys?: Array<{ __typename?: 'LlmApiKey'; provider?: string | null }> | null;
  workExperiences?: Array<{ __typename?: 'WorkExperience'; id?: string | null }> | null;
};

export type DismissOnboardingChecklistMutationVariables = Exact<{ [key: string]: never }>;

export type DismissOnboardingChecklistMutation = {
  __typename?: 'Mutation';
  dismissOnboardingChecklist?: boolean | null;
};

export type GenerateIntoDocumentDraftMutationVariables = Exact<{
  draftId: Scalars['ID']['input'];
  instructions?: InputMaybe<Scalars['String']['input']>;
  resumeDocumentId?: InputMaybe<Scalars['ID']['input']>;
  resumeDraftId?: InputMaybe<Scalars['ID']['input']>;
}>;

export type GenerateIntoDocumentDraftMutation = {
  __typename?: 'Mutation';
  generateIntoDocumentDraft: {
    __typename?: 'GeneratedDraftContent';
    contentJson: string;
    plainText: string;
  };
};

export type ExtractDocumentTextMutationVariables = Exact<{
  documentId: Scalars['ID']['input'];
}>;

export type ExtractDocumentTextMutation = {
  __typename?: 'Mutation';
  extractDocumentText?: { __typename?: 'ExtractDocumentTextPayload'; text?: string | null } | null;
};

export type DocumentsQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type DocumentsQuery = {
  __typename?: 'Query';
  documents?: Array<{
    __typename?: 'Document';
    id?: string | null;
    applicationId?: string | null;
    name?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    url?: string | null;
    documentType?: string | null;
    version?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type DocumentDraftsQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type DocumentDraftsQuery = {
  __typename?: 'Query';
  documentDrafts?: Array<{
    __typename?: 'DocumentDraft';
    id?: string | null;
    applicationId?: string | null;
    type?: string | null;
    title?: string | null;
    plainText?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type RequestUploadUrlMutationVariables = Exact<{
  input: RequestUploadUrlInput;
}>;

export type RequestUploadUrlMutation = {
  __typename?: 'Mutation';
  requestUploadUrl?: {
    __typename?: 'UploadUrlPayload';
    uploadUrl?: string | null;
    storageKey?: string | null;
    access?: string | null;
  } | null;
};

export type ConfirmDocumentMutationVariables = Exact<{
  input: ConfirmDocumentInput;
}>;

export type ConfirmDocumentMutation = {
  __typename?: 'Mutation';
  confirmDocument?: {
    __typename?: 'Document';
    id?: string | null;
    applicationId?: string | null;
    name?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    url?: string | null;
    documentType?: string | null;
    version?: string | null;
    createdAt?: string | null;
  } | null;
};

export type DeleteDocumentMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteDocumentMutation = { __typename?: 'Mutation'; deleteDocument?: boolean | null };

export type DocumentDraftQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DocumentDraftQuery = {
  __typename?: 'Query';
  documentDraft?: {
    __typename?: 'DocumentDraft';
    id?: string | null;
    applicationId?: string | null;
    type?: string | null;
    title?: string | null;
    contentJson?: string | null;
    plainText?: string | null;
    sourceDocumentId?: string | null;
    aiInstructions?: string | null;
    aiGenerated?: boolean | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    myRating?: {
      __typename?: 'AiRating';
      rating?: AiFeedbackRating | null;
      reason?: AiFeedbackReason | null;
    } | null;
  } | null;
};

export type UpdateDocumentDraftContentMutationVariables = Exact<{
  input: UpdateDocumentDraftContentInput;
}>;

export type UpdateDocumentDraftContentMutation = {
  __typename?: 'Mutation';
  updateDocumentDraftContent?: {
    __typename?: 'DocumentDraft';
    id?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type ExportDocumentDraftToPdfMutationVariables = Exact<{
  draftId: Scalars['ID']['input'];
}>;

export type ExportDocumentDraftToPdfMutation = {
  __typename?: 'Mutation';
  exportDocumentDraftToPdf?: {
    __typename?: 'Document';
    id?: string | null;
    name?: string | null;
    url?: string | null;
  } | null;
};

export type RenameDocumentDraftMutationVariables = Exact<{
  draftId: Scalars['ID']['input'];
  title: Scalars['String']['input'];
}>;

export type RenameDocumentDraftMutation = {
  __typename?: 'Mutation';
  renameDocumentDraft?: {
    __typename?: 'DocumentDraft';
    id?: string | null;
    title?: string | null;
  } | null;
};

export type DeleteDocumentDraftMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteDocumentDraftMutation = {
  __typename?: 'Mutation';
  deleteDocumentDraft?: boolean | null;
};

export type DocumentDraftVersionsQueryVariables = Exact<{
  draftId: Scalars['ID']['input'];
}>;

export type DocumentDraftVersionsQuery = {
  __typename?: 'Query';
  documentDraftVersions?: Array<{
    __typename?: 'DocumentDraftVersion';
    id?: string | null;
    source?: string | null;
    characterCount?: number | null;
    createdAt?: string | null;
  }> | null;
};

export type DocumentDraftVersionQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DocumentDraftVersionQuery = {
  __typename?: 'Query';
  documentDraftVersion?: {
    __typename?: 'DocumentDraftVersion';
    id?: string | null;
    source?: string | null;
    plainText?: string | null;
    createdAt?: string | null;
  } | null;
};

export type CreateDocumentDraftVersionMutationVariables = Exact<{
  draftId: Scalars['ID']['input'];
}>;

export type CreateDocumentDraftVersionMutation = {
  __typename?: 'Mutation';
  createDocumentDraftVersion?: {
    __typename?: 'DocumentDraftVersion';
    id?: string | null;
    source?: string | null;
  } | null;
};

export type RestoreDocumentDraftVersionMutationVariables = Exact<{
  versionId: Scalars['ID']['input'];
}>;

export type RestoreDocumentDraftVersionMutation = {
  __typename?: 'Mutation';
  restoreDocumentDraftVersion?: {
    __typename?: 'DocumentDraft';
    id?: string | null;
    contentJson?: string | null;
    plainText?: string | null;
  } | null;
};

export type PolishDocumentDraftMutationVariables = Exact<{
  draftId: Scalars['ID']['input'];
  plainText: Scalars['String']['input'];
  instructions?: InputMaybe<Scalars['String']['input']>;
}>;

export type PolishDocumentDraftMutation = {
  __typename?: 'Mutation';
  polishDocumentDraft: { __typename?: 'PolishDocumentDraftResult'; markdown: string };
};

export type PostingRequirementsQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type PostingRequirementsQuery = {
  __typename?: 'Query';
  postingRequirements?: {
    __typename?: 'PostingRequirements';
    id?: string | null;
    applicationId?: string | null;
    mustHave?: Array<string> | null;
    niceToHave?: Array<string> | null;
    keywords?: Array<string> | null;
    seniority?: string | null;
    generatedAt?: string | null;
    isStale?: boolean | null;
  } | null;
};

export type ExtractPostingRequirementsMutationVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type ExtractPostingRequirementsMutation = {
  __typename?: 'Mutation';
  extractPostingRequirements?: {
    __typename?: 'PostingRequirements';
    id?: string | null;
    applicationId?: string | null;
    mustHave?: Array<string> | null;
    niceToHave?: Array<string> | null;
    keywords?: Array<string> | null;
    seniority?: string | null;
    generatedAt?: string | null;
    isStale?: boolean | null;
  } | null;
};

export type ResumeAtsScoresQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type ResumeAtsScoresQuery = {
  __typename?: 'Query';
  resumeAtsScores?: Array<{
    __typename?: 'AtsScore';
    id?: string | null;
    applicationId?: string | null;
    documentDraftId?: string | null;
    documentId?: string | null;
    score?: number | null;
    label?: string | null;
    readable?: boolean | null;
    generatedAt?: string | null;
    isStale?: boolean | null;
    checks?: Array<{
      __typename?: 'AtsCheck';
      id?: string | null;
      label?: string | null;
      passed?: boolean | null;
      points?: number | null;
      maxPoints?: number | null;
      hint?: string | null;
    }> | null;
  }> | null;
};

export type ComputeResumeAtsScoreMutationVariables = Exact<{
  documentDraftId?: InputMaybe<Scalars['ID']['input']>;
  documentId?: InputMaybe<Scalars['ID']['input']>;
}>;

export type ComputeResumeAtsScoreMutation = {
  __typename?: 'Mutation';
  computeResumeAtsScore?: {
    __typename?: 'AtsScore';
    id?: string | null;
    applicationId?: string | null;
    documentDraftId?: string | null;
    documentId?: string | null;
    score?: number | null;
    label?: string | null;
    readable?: boolean | null;
    generatedAt?: string | null;
    isStale?: boolean | null;
    checks?: Array<{
      __typename?: 'AtsCheck';
      id?: string | null;
      label?: string | null;
      passed?: boolean | null;
      points?: number | null;
      maxPoints?: number | null;
      hint?: string | null;
    }> | null;
  } | null;
};

export type ResumeGapsQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type ResumeGapsQuery = {
  __typename?: 'Query';
  resumeGaps?: {
    __typename?: 'ResumeGaps';
    requirementsRead?: boolean | null;
    requirementGaps?: Array<string> | null;
    rolesWithoutMetrics?: Array<{
      __typename?: 'RoleWithoutMetrics';
      workExperienceId?: string | null;
      company?: string | null;
      title?: string | null;
      description?: string | null;
    }> | null;
  } | null;
};

export type DismissResumeGapMutationVariables = Exact<{
  applicationId: Scalars['ID']['input'];
  key: Scalars['String']['input'];
}>;

export type DismissResumeGapMutation = {
  __typename?: 'Mutation';
  dismissResumeGap?: {
    __typename?: 'ResumeGaps';
    requirementsRead?: boolean | null;
    requirementGaps?: Array<string> | null;
    rolesWithoutMetrics?: Array<{
      __typename?: 'RoleWithoutMetrics';
      workExperienceId?: string | null;
      company?: string | null;
      title?: string | null;
      description?: string | null;
    }> | null;
  } | null;
};

export type ResumeMatchesQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type ResumeMatchesQuery = {
  __typename?: 'Query';
  resumeMatches?: Array<{
    __typename?: 'ResumeMatch';
    id?: string | null;
    applicationId?: string | null;
    documentDraftId?: string | null;
    documentId?: string | null;
    score?: number | null;
    label?: string | null;
    matchedKeywords?: Array<string> | null;
    missingKeywords?: Array<string> | null;
    summary?: string | null;
    generatedAt?: string | null;
    isStale?: boolean | null;
  }> | null;
};

export type ComputeResumeMatchScoreMutationVariables = Exact<{
  applicationId: Scalars['ID']['input'];
  documentDraftId?: InputMaybe<Scalars['ID']['input']>;
  documentId?: InputMaybe<Scalars['ID']['input']>;
}>;

export type ComputeResumeMatchScoreMutation = {
  __typename?: 'Mutation';
  computeResumeMatchScore?: {
    __typename?: 'ResumeMatch';
    id?: string | null;
    applicationId?: string | null;
    documentDraftId?: string | null;
    documentId?: string | null;
    score?: number | null;
    label?: string | null;
    matchedKeywords?: Array<string> | null;
    missingKeywords?: Array<string> | null;
    summary?: string | null;
    generatedAt?: string | null;
    isStale?: boolean | null;
  } | null;
};

export type CreateDocumentDraftMutationVariables = Exact<{
  input: CreateDocumentDraftInput;
}>;

export type CreateDocumentDraftMutation = {
  __typename?: 'Mutation';
  createDocumentDraft?: {
    __typename?: 'DocumentDraft';
    id?: string | null;
    applicationId?: string | null;
    type?: string | null;
    title?: string | null;
  } | null;
};

export type InterviewQuestionsQueryVariables = Exact<{
  interviewRoundId: Scalars['ID']['input'];
}>;

export type InterviewQuestionsQuery = {
  __typename?: 'Query';
  interviewQuestions?: Array<{
    __typename?: 'InterviewQuestion';
    id?: string | null;
    interviewRoundId?: string | null;
    question?: string | null;
    answer?: string | null;
    position?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type CreateInterviewQuestionMutationVariables = Exact<{
  input: CreateInterviewQuestionInput;
}>;

export type CreateInterviewQuestionMutation = {
  __typename?: 'Mutation';
  createInterviewQuestion?: {
    __typename?: 'InterviewQuestion';
    id?: string | null;
    interviewRoundId?: string | null;
    question?: string | null;
    answer?: string | null;
    position?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type UpdateInterviewQuestionMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateInterviewQuestionInput;
}>;

export type UpdateInterviewQuestionMutation = {
  __typename?: 'Mutation';
  updateInterviewQuestion?: {
    __typename?: 'InterviewQuestion';
    id?: string | null;
    interviewRoundId?: string | null;
    question?: string | null;
    answer?: string | null;
    position?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type DeleteInterviewQuestionMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteInterviewQuestionMutation = {
  __typename?: 'Mutation';
  deleteInterviewQuestion?: boolean | null;
};

export type ReorderInterviewQuestionsMutationVariables = Exact<{
  interviewRoundId: Scalars['ID']['input'];
  orderedIds: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;

export type ReorderInterviewQuestionsMutation = {
  __typename?: 'Mutation';
  reorderInterviewQuestions?: Array<{
    __typename?: 'InterviewQuestion';
    id?: string | null;
    interviewRoundId?: string | null;
    question?: string | null;
    answer?: string | null;
    position?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type InterviewRoundsQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type InterviewRoundsQuery = {
  __typename?: 'Query';
  interviewRounds?: Array<{
    __typename?: 'InterviewRound';
    id?: string | null;
    applicationId?: string | null;
    type?: InterviewRoundType | null;
    scheduledAt?: string | null;
    completedAt?: string | null;
    interviewerName?: string | null;
    notes?: string | null;
    outcome?: InterviewRoundOutcome | null;
    questionCount?: number | null;
    mockQuestionCount?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type CreateInterviewRoundMutationVariables = Exact<{
  input: CreateInterviewRoundInput;
}>;

export type CreateInterviewRoundMutation = {
  __typename?: 'Mutation';
  createInterviewRound?: {
    __typename?: 'InterviewRound';
    id?: string | null;
    applicationId?: string | null;
    type?: InterviewRoundType | null;
    scheduledAt?: string | null;
    completedAt?: string | null;
    interviewerName?: string | null;
    notes?: string | null;
    outcome?: InterviewRoundOutcome | null;
    questionCount?: number | null;
    mockQuestionCount?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type UpdateInterviewRoundMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateInterviewRoundInput;
}>;

export type UpdateInterviewRoundMutation = {
  __typename?: 'Mutation';
  updateInterviewRound?: {
    __typename?: 'InterviewRound';
    id?: string | null;
    applicationId?: string | null;
    type?: InterviewRoundType | null;
    scheduledAt?: string | null;
    completedAt?: string | null;
    interviewerName?: string | null;
    notes?: string | null;
    outcome?: InterviewRoundOutcome | null;
    questionCount?: number | null;
    mockQuestionCount?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type DeleteInterviewRoundMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteInterviewRoundMutation = {
  __typename?: 'Mutation';
  deleteInterviewRound?: boolean | null;
};

export type MockInterviewQuestionsQueryVariables = Exact<{
  interviewRoundId: Scalars['ID']['input'];
}>;

export type MockInterviewQuestionsQuery = {
  __typename?: 'Query';
  mockInterviewQuestions?: Array<{
    __typename?: 'MockInterviewQuestion';
    id?: string | null;
    interviewRoundId?: string | null;
    question?: string | null;
    answer?: string | null;
    answerSource?: AnswerSource | null;
    talkingPoints?: string | null;
    talkingPointsGeneratedAt?: string | null;
    position?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type CreateMockInterviewQuestionMutationVariables = Exact<{
  input: CreateMockInterviewQuestionInput;
}>;

export type CreateMockInterviewQuestionMutation = {
  __typename?: 'Mutation';
  createMockInterviewQuestion?: {
    __typename?: 'MockInterviewQuestion';
    id?: string | null;
    interviewRoundId?: string | null;
    question?: string | null;
    answer?: string | null;
    answerSource?: AnswerSource | null;
    talkingPoints?: string | null;
    talkingPointsGeneratedAt?: string | null;
    position?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type UpdateMockInterviewQuestionMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateMockInterviewQuestionInput;
}>;

export type UpdateMockInterviewQuestionMutation = {
  __typename?: 'Mutation';
  updateMockInterviewQuestion?: {
    __typename?: 'MockInterviewQuestion';
    id?: string | null;
    interviewRoundId?: string | null;
    question?: string | null;
    answer?: string | null;
    answerSource?: AnswerSource | null;
    talkingPoints?: string | null;
    talkingPointsGeneratedAt?: string | null;
    position?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type DeleteMockInterviewQuestionMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteMockInterviewQuestionMutation = {
  __typename?: 'Mutation';
  deleteMockInterviewQuestion?: boolean | null;
};

export type ReorderMockInterviewQuestionsMutationVariables = Exact<{
  interviewRoundId: Scalars['ID']['input'];
  orderedIds: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;

export type ReorderMockInterviewQuestionsMutation = {
  __typename?: 'Mutation';
  reorderMockInterviewQuestions?: Array<{
    __typename?: 'MockInterviewQuestion';
    id?: string | null;
    interviewRoundId?: string | null;
    question?: string | null;
    answer?: string | null;
    answerSource?: AnswerSource | null;
    talkingPoints?: string | null;
    talkingPointsGeneratedAt?: string | null;
    position?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type GenerateMockInterviewQuestionsMutationVariables = Exact<{
  interviewRoundId: Scalars['ID']['input'];
  prompt?: InputMaybe<Scalars['String']['input']>;
  count?: InputMaybe<Scalars['Int']['input']>;
  useProfile?: InputMaybe<Scalars['Boolean']['input']>;
  documentId?: InputMaybe<Scalars['ID']['input']>;
}>;

export type GenerateMockInterviewQuestionsMutation = {
  __typename?: 'Mutation';
  generateMockInterviewQuestions?: {
    __typename?: 'GeneratedMockQuestions';
    suggestions?: Array<string> | null;
    usedJobDescription?: boolean | null;
    usedBriefing?: boolean | null;
    usedProfile?: boolean | null;
    usedDocument?: boolean | null;
  } | null;
};

export type GenerateMockInterviewAnswerMutationVariables = Exact<{
  mockInterviewQuestionId: Scalars['ID']['input'];
  prompt?: InputMaybe<Scalars['String']['input']>;
  useProfile?: InputMaybe<Scalars['Boolean']['input']>;
  documentId?: InputMaybe<Scalars['ID']['input']>;
}>;

export type GenerateMockInterviewAnswerMutation = {
  __typename?: 'Mutation';
  generateMockInterviewAnswer?: {
    __typename?: 'GeneratedMockAnswer';
    answer?: string | null;
    usedJobDescription?: boolean | null;
    usedBriefing?: boolean | null;
    usedProfile?: boolean | null;
    usedDocument?: boolean | null;
  } | null;
};

export type GenerateMockTalkingPointsMutationVariables = Exact<{
  mockInterviewQuestionId: Scalars['ID']['input'];
  prompt?: InputMaybe<Scalars['String']['input']>;
  useProfile?: InputMaybe<Scalars['Boolean']['input']>;
  documentId?: InputMaybe<Scalars['ID']['input']>;
}>;

export type GenerateMockTalkingPointsMutation = {
  __typename?: 'Mutation';
  generateMockTalkingPoints?: {
    __typename?: 'GeneratedTalkingPoints';
    nothingRelevant?: boolean | null;
    usedProfile?: boolean | null;
    usedDocument?: boolean | null;
    question?: {
      __typename?: 'MockInterviewQuestion';
      id?: string | null;
      interviewRoundId?: string | null;
      question?: string | null;
      answer?: string | null;
      answerSource?: AnswerSource | null;
      talkingPoints?: string | null;
      talkingPointsGeneratedAt?: string | null;
      position?: number | null;
      createdAt?: string | null;
      updatedAt?: string | null;
    } | null;
  } | null;
};

export type CreateNoteMutationVariables = Exact<{
  applicationId: Scalars['ID']['input'];
  content: Scalars['String']['input'];
}>;

export type CreateNoteMutation = {
  __typename?: 'Mutation';
  createNote?: {
    __typename?: 'Note';
    id?: string | null;
    applicationId?: string | null;
    content?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type UpdateNoteMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  content: Scalars['String']['input'];
}>;

export type UpdateNoteMutation = {
  __typename?: 'Mutation';
  updateNote?: {
    __typename?: 'Note';
    id?: string | null;
    applicationId?: string | null;
    content?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type DeleteNoteMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteNoteMutation = { __typename?: 'Mutation'; deleteNote?: boolean | null };

export type NotesQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type NotesQuery = {
  __typename?: 'Query';
  notes?: Array<{
    __typename?: 'Note';
    id?: string | null;
    applicationId?: string | null;
    content?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type OffersQueryVariables = Exact<{
  applicationId: Scalars['ID']['input'];
}>;

export type OffersQuery = {
  __typename?: 'Query';
  offers?: Array<{
    __typename?: 'Offer';
    id?: string | null;
    applicationId?: string | null;
    baseSalary?: number | null;
    bonus?: number | null;
    equity?: string | null;
    benefits?: string | null;
    costOfLivingAdjustment?: number | null;
    currency?: string | null;
    period?: string | null;
    notes?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type CreateOfferMutationVariables = Exact<{
  input: CreateOfferInput;
}>;

export type CreateOfferMutation = {
  __typename?: 'Mutation';
  createOffer?: { __typename?: 'Offer'; id?: string | null } | null;
};

export type UpdateOfferMutationVariables = Exact<{
  input: UpdateOfferInput;
}>;

export type UpdateOfferMutation = {
  __typename?: 'Mutation';
  updateOffer?: { __typename?: 'Offer'; id?: string | null } | null;
};

export type DeleteOfferMutationVariables = Exact<{
  id: Scalars['String']['input'];
}>;

export type DeleteOfferMutation = { __typename?: 'Mutation'; deleteOffer?: boolean | null };

export type MyOffersQueryVariables = Exact<{ [key: string]: never }>;

export type MyOffersQuery = {
  __typename?: 'Query';
  myOffers?: Array<{
    __typename?: 'OfferWithApplication';
    company?: string | null;
    role?: string | null;
    offer?: {
      __typename?: 'Offer';
      id?: string | null;
      applicationId?: string | null;
      baseSalary?: number | null;
      bonus?: number | null;
      equity?: string | null;
      benefits?: string | null;
      costOfLivingAdjustment?: number | null;
      currency?: string | null;
      period?: string | null;
      notes?: string | null;
    } | null;
  }> | null;
};

export type CompareOffersMutationVariables = Exact<{
  offerIds: Array<Scalars['String']['input']> | Scalars['String']['input'];
}>;

export type CompareOffersMutation = {
  __typename?: 'Mutation';
  compareOffers?: Array<{
    __typename?: 'OfferComparison';
    company?: string | null;
    role?: string | null;
    normalizedYearlySalary?: number | null;
    totalCompensation?: number | null;
    offer?: {
      __typename?: 'Offer';
      id?: string | null;
      baseSalary?: number | null;
      bonus?: number | null;
      equity?: string | null;
      benefits?: string | null;
      costOfLivingAdjustment?: number | null;
      currency?: string | null;
      period?: string | null;
    } | null;
  }> | null;
};

export type AwardsQueryVariables = Exact<{ [key: string]: never }>;

export type AwardsQuery = {
  __typename?: 'Query';
  awards?: Array<{
    __typename?: 'Award';
    id?: string | null;
    title?: string | null;
    issuer?: string | null;
    date?: string | null;
    description?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type CreateAwardMutationVariables = Exact<{
  input: CreateAwardInput;
}>;

export type CreateAwardMutation = {
  __typename?: 'Mutation';
  createAward?: {
    __typename?: 'Award';
    id?: string | null;
    title?: string | null;
    issuer?: string | null;
    date?: string | null;
    description?: string | null;
    createdAt?: string | null;
  } | null;
};

export type UpdateAwardMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateAwardInput;
}>;

export type UpdateAwardMutation = {
  __typename?: 'Mutation';
  updateAward?: {
    __typename?: 'Award';
    id?: string | null;
    title?: string | null;
    issuer?: string | null;
    date?: string | null;
    description?: string | null;
    createdAt?: string | null;
  } | null;
};

export type DeleteAwardMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteAwardMutation = { __typename?: 'Mutation'; deleteAward?: boolean | null };

export type CertificationsQueryVariables = Exact<{ [key: string]: never }>;

export type CertificationsQuery = {
  __typename?: 'Query';
  certifications?: Array<{
    __typename?: 'Certification';
    id?: string | null;
    name?: string | null;
    issuer?: string | null;
    issuedAt?: string | null;
    expiresAt?: string | null;
    credentialUrl?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type CreateCertificationMutationVariables = Exact<{
  input: CreateCertificationInput;
}>;

export type CreateCertificationMutation = {
  __typename?: 'Mutation';
  createCertification?: {
    __typename?: 'Certification';
    id?: string | null;
    name?: string | null;
    issuer?: string | null;
    issuedAt?: string | null;
    expiresAt?: string | null;
    credentialUrl?: string | null;
    createdAt?: string | null;
  } | null;
};

export type UpdateCertificationMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateCertificationInput;
}>;

export type UpdateCertificationMutation = {
  __typename?: 'Mutation';
  updateCertification?: {
    __typename?: 'Certification';
    id?: string | null;
    name?: string | null;
    issuer?: string | null;
    issuedAt?: string | null;
    expiresAt?: string | null;
    credentialUrl?: string | null;
    createdAt?: string | null;
  } | null;
};

export type DeleteCertificationMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteCertificationMutation = {
  __typename?: 'Mutation';
  deleteCertification?: boolean | null;
};

export type ImportCvProfileMutationVariables = Exact<{
  input: ImportCvProfileInput;
}>;

export type ImportCvProfileMutation = {
  __typename?: 'Mutation';
  importCvProfile?: {
    __typename?: 'ImportCvProfileResult';
    workExperiences?: number | null;
    educations?: number | null;
    skills?: number | null;
    certifications?: number | null;
    languages?: number | null;
    projects?: number | null;
    awards?: number | null;
  } | null;
};

export type CvImportSessionQueryVariables = Exact<{ [key: string]: never }>;

export type CvImportSessionQuery = {
  __typename?: 'Query';
  me?: { __typename?: 'User'; id?: string | null } | null;
};

export type EducationsQueryVariables = Exact<{ [key: string]: never }>;

export type EducationsQuery = {
  __typename?: 'Query';
  educations?: Array<{
    __typename?: 'Education';
    id?: string | null;
    institution?: string | null;
    degree?: string | null;
    field?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type CreateEducationMutationVariables = Exact<{
  input: CreateEducationInput;
}>;

export type CreateEducationMutation = {
  __typename?: 'Mutation';
  createEducation?: {
    __typename?: 'Education';
    id?: string | null;
    institution?: string | null;
    degree?: string | null;
    field?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type UpdateEducationMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateEducationInput;
}>;

export type UpdateEducationMutation = {
  __typename?: 'Mutation';
  updateEducation?: {
    __typename?: 'Education';
    id?: string | null;
    institution?: string | null;
    degree?: string | null;
    field?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type DeleteEducationMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteEducationMutation = { __typename?: 'Mutation'; deleteEducation?: boolean | null };

export type LanguagesQueryVariables = Exact<{ [key: string]: never }>;

export type LanguagesQuery = {
  __typename?: 'Query';
  languages?: Array<{
    __typename?: 'Language';
    id?: string | null;
    name?: string | null;
    proficiency?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type CreateLanguageMutationVariables = Exact<{
  input: CreateLanguageInput;
}>;

export type CreateLanguageMutation = {
  __typename?: 'Mutation';
  createLanguage?: {
    __typename?: 'Language';
    id?: string | null;
    name?: string | null;
    proficiency?: string | null;
    createdAt?: string | null;
  } | null;
};

export type UpdateLanguageMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateLanguageInput;
}>;

export type UpdateLanguageMutation = {
  __typename?: 'Mutation';
  updateLanguage?: {
    __typename?: 'Language';
    id?: string | null;
    name?: string | null;
    proficiency?: string | null;
    createdAt?: string | null;
  } | null;
};

export type DeleteLanguageMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteLanguageMutation = { __typename?: 'Mutation'; deleteLanguage?: boolean | null };

export type ProjectsQueryVariables = Exact<{ [key: string]: never }>;

export type ProjectsQuery = {
  __typename?: 'Query';
  projects?: Array<{
    __typename?: 'Project';
    id?: string | null;
    name?: string | null;
    role?: string | null;
    url?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type CreateProjectMutationVariables = Exact<{
  input: CreateProjectInput;
}>;

export type CreateProjectMutation = {
  __typename?: 'Mutation';
  createProject?: {
    __typename?: 'Project';
    id?: string | null;
    name?: string | null;
    role?: string | null;
    url?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
    createdAt?: string | null;
  } | null;
};

export type UpdateProjectMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateProjectInput;
}>;

export type UpdateProjectMutation = {
  __typename?: 'Mutation';
  updateProject?: {
    __typename?: 'Project';
    id?: string | null;
    name?: string | null;
    role?: string | null;
    url?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
    createdAt?: string | null;
  } | null;
};

export type DeleteProjectMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteProjectMutation = { __typename?: 'Mutation'; deleteProject?: boolean | null };

export type SkillsQueryVariables = Exact<{ [key: string]: never }>;

export type SkillsQuery = {
  __typename?: 'Query';
  skills?: Array<{
    __typename?: 'Skill';
    id?: string | null;
    name?: string | null;
    category?: string | null;
    proficiency?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type CreateSkillMutationVariables = Exact<{
  input: CreateSkillInput;
}>;

export type CreateSkillMutation = {
  __typename?: 'Mutation';
  createSkill?: {
    __typename?: 'Skill';
    id?: string | null;
    name?: string | null;
    category?: string | null;
    proficiency?: string | null;
    createdAt?: string | null;
  } | null;
};

export type UpdateSkillMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateSkillInput;
}>;

export type UpdateSkillMutation = {
  __typename?: 'Mutation';
  updateSkill?: {
    __typename?: 'Skill';
    id?: string | null;
    name?: string | null;
    category?: string | null;
    proficiency?: string | null;
    createdAt?: string | null;
  } | null;
};

export type DeleteSkillMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteSkillMutation = { __typename?: 'Mutation'; deleteSkill?: boolean | null };

export type WorkExperiencesQueryVariables = Exact<{ [key: string]: never }>;

export type WorkExperiencesQuery = {
  __typename?: 'Query';
  workExperiences?: Array<{
    __typename?: 'WorkExperience';
    id?: string | null;
    company?: string | null;
    title?: string | null;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> | null;
};

export type CreateWorkExperienceMutationVariables = Exact<{
  input: CreateWorkExperienceInput;
}>;

export type CreateWorkExperienceMutation = {
  __typename?: 'Mutation';
  createWorkExperience?: {
    __typename?: 'WorkExperience';
    id?: string | null;
    company?: string | null;
    title?: string | null;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type UpdateWorkExperienceMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateWorkExperienceInput;
}>;

export type UpdateWorkExperienceMutation = {
  __typename?: 'Mutation';
  updateWorkExperience?: {
    __typename?: 'WorkExperience';
    id?: string | null;
    company?: string | null;
    title?: string | null;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

export type DeleteWorkExperienceMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteWorkExperienceMutation = {
  __typename?: 'Mutation';
  deleteWorkExperience?: boolean | null;
};

export type MeQueryVariables = Exact<{ [key: string]: never }>;

export type MeQuery = {
  __typename?: 'Query';
  me?: {
    __typename?: 'User';
    id?: string | null;
    email?: string | null;
    name?: string | null;
    timezone?: string | null;
    targetRole?: string | null;
    phone?: string | null;
    location?: string | null;
    profileLinks?: Array<string> | null;
    avatarUrl?: string | null;
    backupEmail?: string | null;
    backupEmailVerifiedAt?: string | null;
    hasPassword?: boolean | null;
  } | null;
};

export type RequestAvatarUploadUrlMutationVariables = Exact<{
  filename: Scalars['String']['input'];
  mimeType: Scalars['String']['input'];
}>;

export type RequestAvatarUploadUrlMutation = {
  __typename?: 'Mutation';
  requestAvatarUploadUrl?: {
    __typename?: 'UploadUrlPayload';
    uploadUrl?: string | null;
    storageKey?: string | null;
  } | null;
};

export type ConfirmAvatarMutationVariables = Exact<{
  storageKey: Scalars['String']['input'];
  mimeType: Scalars['String']['input'];
  sizeBytes: Scalars['Int']['input'];
}>;

export type ConfirmAvatarMutation = { __typename?: 'Mutation'; confirmAvatar?: string | null };

export type RemoveAvatarMutationVariables = Exact<{ [key: string]: never }>;

export type RemoveAvatarMutation = { __typename?: 'Mutation'; removeAvatar?: boolean | null };

export type UpdateProfileMutationVariables = Exact<{
  name?: InputMaybe<Scalars['String']['input']>;
  timezone?: InputMaybe<Scalars['String']['input']>;
  targetRole?: InputMaybe<Scalars['String']['input']>;
  phone?: InputMaybe<Scalars['String']['input']>;
  location?: InputMaybe<Scalars['String']['input']>;
  profileLinks?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  customAiPrompt?: InputMaybe<Scalars['String']['input']>;
  useCrossApplicationContext?: InputMaybe<Scalars['Boolean']['input']>;
  llmFallbackWhenLimited?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type UpdateProfileMutation = { __typename?: 'Mutation'; updateProfile?: boolean | null };

export type ExportUserDataQueryVariables = Exact<{ [key: string]: never }>;

export type ExportUserDataQuery = { __typename?: 'Query'; exportUserData?: string | null };

export type ImportUserDataMutationVariables = Exact<{
  data: Scalars['String']['input'];
}>;

export type ImportUserDataMutation = {
  __typename?: 'Mutation';
  importUserData?: {
    __typename?: 'ImportSummary';
    applicationsImported?: number | null;
    applicationsSkipped?: number | null;
    notesImported?: number | null;
    documentsSkipped?: number | null;
  } | null;
};

export type NotificationPreferencesQueryVariables = Exact<{ [key: string]: never }>;

export type NotificationPreferencesQuery = {
  __typename?: 'Query';
  notificationPreferences?: {
    __typename?: 'NotificationPreferences';
    weeklyDigestEnabled?: boolean | null;
    digestFrequency?: string | null;
    followUpRemindersEnabled?: boolean | null;
    pushNotificationsEnabled?: boolean | null;
    weeklyApplicationGoal?: number | null;
  } | null;
};

export type UpdateNotificationPreferencesMutationVariables = Exact<{
  digestFrequency?: InputMaybe<DigestFrequency>;
  followUpRemindersEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  pushNotificationsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  weeklyApplicationGoal?: InputMaybe<Scalars['Int']['input']>;
}>;

export type UpdateNotificationPreferencesMutation = {
  __typename?: 'Mutation';
  updateNotificationPreferences?: boolean | null;
};

export type StorageUsageQueryVariables = Exact<{ [key: string]: never }>;

export type StorageUsageQuery = {
  __typename?: 'Query';
  me?: {
    __typename?: 'User';
    storageUsedBytes?: number | null;
    storageLimitBytes?: number | null;
  } | null;
};

export type LlmApiKeysQueryVariables = Exact<{ [key: string]: never }>;

export type LlmApiKeysQuery = {
  __typename?: 'Query';
  llmApiKeys?: Array<{
    __typename?: 'LlmApiKey';
    provider?: string | null;
    model?: string | null;
    baseUrl?: string | null;
    monthlyTokenLimit?: number | null;
  }> | null;
  me?: {
    __typename?: 'User';
    aiProviderOrder?: Array<string> | null;
    customAiPrompt?: string | null;
    useCrossApplicationContext?: boolean | null;
  } | null;
};

export type SetAiProviderOrderMutationVariables = Exact<{
  order: Array<Scalars['String']['input']> | Scalars['String']['input'];
}>;

export type SetAiProviderOrderMutation = {
  __typename?: 'Mutation';
  setAiProviderOrder?: boolean | null;
};

export type SaveLlmApiKeyMutationVariables = Exact<{
  provider: Scalars['String']['input'];
  apiKey: Scalars['String']['input'];
  model?: InputMaybe<Scalars['String']['input']>;
  baseUrl?: InputMaybe<Scalars['String']['input']>;
}>;

export type SaveLlmApiKeyMutation = { __typename?: 'Mutation'; saveLlmApiKey?: boolean | null };

export type DeleteLlmApiKeyMutationVariables = Exact<{
  provider: Scalars['String']['input'];
}>;

export type DeleteLlmApiKeyMutation = { __typename?: 'Mutation'; deleteLlmApiKey?: boolean | null };

export type SetLlmApiKeyMonthlyLimitMutationVariables = Exact<{
  provider: Scalars['String']['input'];
  monthlyTokenLimit?: InputMaybe<Scalars['Int']['input']>;
}>;

export type SetLlmApiKeyMonthlyLimitMutation = {
  __typename?: 'Mutation';
  setLlmApiKeyMonthlyLimit?: boolean | null;
};

export type TestLlmApiKeyMutationVariables = Exact<{
  provider: Scalars['String']['input'];
  apiKey?: InputMaybe<Scalars['String']['input']>;
  model?: InputMaybe<Scalars['String']['input']>;
  baseUrl?: InputMaybe<Scalars['String']['input']>;
}>;

export type TestLlmApiKeyMutation = {
  __typename?: 'Mutation';
  testLlmApiKey?: {
    __typename?: 'TestLlmApiKeyResult';
    ok?: boolean | null;
    error?: string | null;
  } | null;
};

export type LlmUsageSummaryQueryVariables = Exact<{ [key: string]: never }>;

export type LlmUsageSummaryQuery = {
  __typename?: 'Query';
  llmUsageSummary?: Array<{
    __typename?: 'LlmUsageSummary';
    provider?: string | null;
    requestCount?: number | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    cacheReadTokens?: number | null;
    cacheWriteTokens?: number | null;
    lastUsedAt?: string | null;
    monthlyTokenLimit?: number | null;
    limitReached?: boolean | null;
  }> | null;
};

export type ApiTokensQueryVariables = Exact<{ [key: string]: never }>;

export type ApiTokensQuery = {
  __typename?: 'Query';
  apiTokens?: Array<{
    __typename?: 'ApiToken';
    id?: string | null;
    name?: string | null;
    scope?: string | null;
    lastUsedAt?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type CreateApiTokenMutationVariables = Exact<{
  name: Scalars['String']['input'];
  scope?: InputMaybe<ApiTokenScope>;
}>;

export type CreateApiTokenMutation = {
  __typename?: 'Mutation';
  createApiToken?: {
    __typename?: 'CreateApiTokenPayload';
    id?: string | null;
    name?: string | null;
    token?: string | null;
    scope?: string | null;
    createdAt?: string | null;
  } | null;
};

export type DeleteApiTokenMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteApiTokenMutation = { __typename?: 'Mutation'; deleteApiToken?: boolean | null };

export type McpOAuthGrantsQueryVariables = Exact<{ [key: string]: never }>;

export type McpOAuthGrantsQuery = {
  __typename?: 'Query';
  mcpOAuthGrants?: Array<{
    __typename?: 'McpOAuthGrant';
    id?: string | null;
    clientName?: string | null;
    scope?: string | null;
    authorizedAt?: string | null;
    lastUsedAt?: string | null;
  }> | null;
};

export type RevokeMcpOAuthGrantMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type RevokeMcpOAuthGrantMutation = {
  __typename?: 'Mutation';
  revokeMcpOAuthGrant?: boolean | null;
};

export type ShareLinksQueryVariables = Exact<{ [key: string]: never }>;

export type ShareLinksQuery = {
  __typename?: 'Query';
  shareLinks?: Array<{
    __typename?: 'ShareLink';
    id?: string | null;
    name?: string | null;
    lastUsedAt?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type CreateShareLinkMutationVariables = Exact<{
  name: Scalars['String']['input'];
}>;

export type CreateShareLinkMutation = {
  __typename?: 'Mutation';
  createShareLink?: {
    __typename?: 'CreateShareLinkPayload';
    id?: string | null;
    name?: string | null;
    token?: string | null;
    createdAt?: string | null;
  } | null;
};

export type DeleteShareLinkMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeleteShareLinkMutation = { __typename?: 'Mutation'; deleteShareLink?: boolean | null };

export type RequestEmailChangeMutationVariables = Exact<{
  currentPassword?: InputMaybe<Scalars['String']['input']>;
  newEmail: Scalars['String']['input'];
}>;

export type RequestEmailChangeMutation = {
  __typename?: 'Mutation';
  requestEmailChange?: boolean | null;
};

export type RequestAddBackupEmailMutationVariables = Exact<{
  currentPassword?: InputMaybe<Scalars['String']['input']>;
  backupEmail: Scalars['String']['input'];
}>;

export type RequestAddBackupEmailMutation = {
  __typename?: 'Mutation';
  requestAddBackupEmail?: boolean | null;
};

export type RemoveBackupEmailMutationVariables = Exact<{
  currentPassword?: InputMaybe<Scalars['String']['input']>;
}>;

export type RemoveBackupEmailMutation = {
  __typename?: 'Mutation';
  removeBackupEmail?: boolean | null;
};

export type UpdatePasswordMutationVariables = Exact<{
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
}>;

export type UpdatePasswordMutation = { __typename?: 'Mutation'; updatePassword?: boolean | null };

export type ReauthenticateMutationVariables = Exact<{
  password: Scalars['String']['input'];
  code?: InputMaybe<Scalars['String']['input']>;
}>;

export type ReauthenticateMutation = {
  __typename?: 'Mutation';
  reauthenticate?: {
    __typename?: 'LoginResult';
    success?: boolean | null;
    totpRequired?: boolean | null;
    accessToken?: string | null;
  } | null;
};

export type SecurityActivityQueryVariables = Exact<{ [key: string]: never }>;

export type SecurityActivityQuery = {
  __typename?: 'Query';
  securityActivity?: Array<{
    __typename?: 'SecurityActivityItem';
    id?: string | null;
    eventType?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type SessionsQueryVariables = Exact<{ [key: string]: never }>;

export type SessionsQuery = {
  __typename?: 'Query';
  sessions?: Array<{
    __typename?: 'Session';
    id?: string | null;
    userAgent?: string | null;
    ipAddress?: string | null;
    deviceLabel?: string | null;
    location?: string | null;
    lastUsedAt?: string | null;
    current?: boolean | null;
  }> | null;
};

export type RevokeSessionMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type RevokeSessionMutation = { __typename?: 'Mutation'; revokeSession?: boolean | null };

export type RevokeOtherSessionsMutationVariables = Exact<{ [key: string]: never }>;

export type RevokeOtherSessionsMutation = {
  __typename?: 'Mutation';
  revokeOtherSessions?: boolean | null;
};

export type TotpEnabledQueryVariables = Exact<{ [key: string]: never }>;

export type TotpEnabledQuery = { __typename?: 'Query'; totpEnabled?: boolean | null };

export type BeginTotpSetupMutationVariables = Exact<{
  password: Scalars['String']['input'];
}>;

export type BeginTotpSetupMutation = {
  __typename?: 'Mutation';
  beginTotpSetup?: {
    __typename?: 'TotpSetup';
    secret?: string | null;
    otpauthUrl?: string | null;
    qrCodeDataUrl?: string | null;
  } | null;
};

export type ConfirmTotpSetupMutationVariables = Exact<{
  code: Scalars['String']['input'];
}>;

export type ConfirmTotpSetupMutation = {
  __typename?: 'Mutation';
  confirmTotpSetup?: {
    __typename?: 'ConfirmTotpSetupResult';
    backupCodes?: Array<string> | null;
  } | null;
};

export type DisableTotpMutationVariables = Exact<{
  password: Scalars['String']['input'];
}>;

export type DisableTotpMutation = { __typename?: 'Mutation'; disableTotp?: boolean | null };

export type RegenerateTotpBackupCodesMutationVariables = Exact<{
  currentPassword: Scalars['String']['input'];
}>;

export type RegenerateTotpBackupCodesMutation = {
  __typename?: 'Mutation';
  regenerateTotpBackupCodes?: {
    __typename?: 'ConfirmTotpSetupResult';
    backupCodes?: Array<string> | null;
  } | null;
};

export type LinkedOAuthAccountsQueryVariables = Exact<{ [key: string]: never }>;

export type LinkedOAuthAccountsQuery = {
  __typename?: 'Query';
  linkedOAuthAccounts?: Array<{
    __typename?: 'LinkedOAuthAccount';
    provider?: OAuthProvider | null;
    email?: string | null;
    createdAt?: string | null;
  }> | null;
};

export type UnlinkOAuthAccountMutationVariables = Exact<{
  provider: OAuthProvider;
}>;

export type UnlinkOAuthAccountMutation = {
  __typename?: 'Mutation';
  unlinkOAuthAccount?: boolean | null;
};

export type StepUpMethodsQueryVariables = Exact<{ [key: string]: never }>;

export type StepUpMethodsQuery = {
  __typename?: 'Query';
  me?: { __typename?: 'User'; stepUpMethods?: Array<StepUpMethod> | null } | null;
};

export type StartOAuthReauthMutationVariables = Exact<{
  provider: OAuthProvider;
}>;

export type StartOAuthReauthMutation = {
  __typename?: 'Mutation';
  startOAuthReauth?: string | null;
};

export type RequestStepUpCodeMutationVariables = Exact<{ [key: string]: never }>;

export type RequestStepUpCodeMutation = {
  __typename?: 'Mutation';
  requestStepUpCode?: boolean | null;
};

export type VerifyStepUpCodeMutationVariables = Exact<{
  code: Scalars['String']['input'];
}>;

export type VerifyStepUpCodeMutation = {
  __typename?: 'Mutation';
  verifyStepUpCode?: boolean | null;
};

export const UpdateApplicationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateApplication' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateApplicationInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateApplication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateApplicationMutation, UpdateApplicationMutationVariables>;
export const UpdateApplicationFlagsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateApplicationFlags' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateApplicationInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateApplication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'starred' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateApplicationFlagsMutation,
  UpdateApplicationFlagsMutationVariables
>;
export const ApplicationHealthScoreDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ApplicationHealthScore' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'applicationHealthScore' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'score' } },
                { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'criteria' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'key' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'points' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'earned' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'met' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ApplicationHealthScoreQuery, ApplicationHealthScoreQueryVariables>;
export const ApplicationSectionCountsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ApplicationSectionCounts' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'application' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'sectionCounts' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'interviews' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'contacts' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'offers' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'companyBriefing' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ApplicationSectionCountsQuery, ApplicationSectionCountsQueryVariables>;
export const ActivityLogsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ActivityLogs' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'activityLogs' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'eventType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'payload' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ActivityLogsQuery, ActivityLogsQueryVariables>;
export const CompanyBriefingDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'CompanyBriefing' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'companyBriefing' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'sources' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'publishedAt' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'generatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CompanyBriefingQuery, CompanyBriefingQueryVariables>;
export const GenerateCompanyBriefingDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'GenerateCompanyBriefing' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'instructions' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'generateCompanyBriefing' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'instructions' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'instructions' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'sources' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'publishedAt' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'generatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GenerateCompanyBriefingMutation,
  GenerateCompanyBriefingMutationVariables
>;
export const ContactsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Contacts' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'contacts' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'email' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phone' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linkedinUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ContactsQuery, ContactsQueryVariables>;
export const CreateContactDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateContact' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'role' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'phone' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'linkedinUrl' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'notes' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createContact' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'name' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'role' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'role' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'email' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'phone' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'phone' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'linkedinUrl' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'linkedinUrl' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'notes' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'notes' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'email' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phone' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linkedinUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateContactMutation, CreateContactMutationVariables>;
export const UpdateContactDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateContact' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'role' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'phone' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'linkedinUrl' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'notes' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateContact' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'name' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'role' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'role' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'email' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'phone' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'phone' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'linkedinUrl' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'linkedinUrl' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'notes' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'notes' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'email' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phone' } },
                { kind: 'Field', name: { kind: 'Name', value: 'linkedinUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateContactMutation, UpdateContactMutationVariables>;
export const DeleteContactDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteContact' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteContact' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteContactMutation, DeleteContactMutationVariables>;
export const ApplicationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Application' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'application' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'jobUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'location' } },
                { kind: 'Field', name: { kind: 'Name', value: 'salaryRange' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postingText' } },
                { kind: 'Field', name: { kind: 'Name', value: 'appliedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'starred' } },
                { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                { kind: 'Field', name: { kind: 'Name', value: 'followUpAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'tags' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'deletedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'purgeAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ApplicationQuery, ApplicationQueryVariables>;
export const BulkUpdateApplicationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'BulkUpdateApplication' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateApplicationInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateApplication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<BulkUpdateApplicationMutation, BulkUpdateApplicationMutationVariables>;
export const CreateApplicationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateApplication' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateApplicationInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createApplication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateApplicationMutation, CreateApplicationMutationVariables>;
export const ParseJobDescriptionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ParseJobDescription' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'text' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'url' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'parseJobDescription' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'text' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'text' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'url' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'url' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'location' } },
                { kind: 'Field', name: { kind: 'Name', value: 'salary' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'postingText' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ParseJobDescriptionMutation, ParseJobDescriptionMutationVariables>;
export const DeleteApplicationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteApplication' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteApplication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteApplicationMutation, DeleteApplicationMutationVariables>;
export const ApplicationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Applications' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'status' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ApplicationStatus' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'applications' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'status' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'status' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'jobUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'location' } },
                { kind: 'Field', name: { kind: 'Name', value: 'salaryRange' } },
                { kind: 'Field', name: { kind: 'Name', value: 'appliedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'starred' } },
                { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                { kind: 'Field', name: { kind: 'Name', value: 'followUpAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'tags' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ApplicationsQuery, ApplicationsQueryVariables>;
export const ApplicationsPageDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ApplicationsPage' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'status' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ApplicationStatus' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'starred' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'search' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'cursor' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'limit' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'likelyGhosted' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'applicationsPage' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'status' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'status' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'starred' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'starred' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'search' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'search' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'cursor' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'cursor' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'limit' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'limit' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'likelyGhosted' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'likelyGhosted' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'hasNextPage' } },
                { kind: 'Field', name: { kind: 'Name', value: 'nextCursor' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'items' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'location' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'appliedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'starred' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'followUpAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'tags' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ApplicationsPageQuery, ApplicationsPageQueryVariables>;
export const BoardApplicationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'BoardApplications' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'applications' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'location' } },
                { kind: 'Field', name: { kind: 'Name', value: 'appliedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'starred' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'tags' } },
                { kind: 'Field', name: { kind: 'Name', value: 'likelyGhosted' } },
                { kind: 'Field', name: { kind: 'Name', value: 'boardPosition' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<BoardApplicationsQuery, BoardApplicationsQueryVariables>;
export const MoveApplicationOnBoardDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'MoveApplicationOnBoard' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'MoveApplicationOnBoardInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'moveApplicationOnBoard' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'boardPosition' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  MoveApplicationOnBoardMutation,
  MoveApplicationOnBoardMutationVariables
>;
export const TrashedApplicationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'TrashedApplications' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'trashedApplications' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'location' } },
                { kind: 'Field', name: { kind: 'Name', value: 'appliedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'deletedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'purgeAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<TrashedApplicationsQuery, TrashedApplicationsQueryVariables>;
export const RestoreApplicationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RestoreApplication' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'restoreApplication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RestoreApplicationMutation, RestoreApplicationMutationVariables>;
export const PermanentlyDeleteApplicationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'PermanentlyDeleteApplication' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'permanentlyDeleteApplication' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  PermanentlyDeleteApplicationMutation,
  PermanentlyDeleteApplicationMutationVariables
>;
export const BulkRestoreApplicationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'BulkRestoreApplications' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'ids' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'bulkRestoreApplications' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'ids' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'ids' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'restored' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  BulkRestoreApplicationsMutation,
  BulkRestoreApplicationsMutationVariables
>;
export const EmptyTrashDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'EmptyTrash' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'emptyTrash' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'deleted' } },
                { kind: 'Field', name: { kind: 'Name', value: 'failed' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<EmptyTrashMutation, EmptyTrashMutationVariables>;
export const RegisterDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'Register' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'captchaToken' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'register' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'email' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'password' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'captchaToken' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'captchaToken' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RegisterMutation, RegisterMutationVariables>;
export const LoginDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'Login' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'captchaToken' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'login' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'email' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'password' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'captchaToken' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'captchaToken' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'success' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totpRequired' } },
                { kind: 'Field', name: { kind: 'Name', value: 'accessToken' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LoginMutation, LoginMutationVariables>;
export const LoginWithTotpDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'LoginWithTotp' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'loginWithTotp' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'email' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'email' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'password' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'code' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LoginWithTotpMutation, LoginWithTotpMutationVariables>;
export const RefreshTokenDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RefreshToken' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'refreshToken' } }],
      },
    },
  ],
} as unknown as DocumentNode<RefreshTokenMutation, RefreshTokenMutationVariables>;
export const LogoutDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'Logout' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'logout' } }],
      },
    },
  ],
} as unknown as DocumentNode<LogoutMutation, LogoutMutationVariables>;
export const DashboardApplicationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'DashboardApplications' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'applications' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'status' } },
                { kind: 'Field', name: { kind: 'Name', value: 'starred' } },
                { kind: 'Field', name: { kind: 'Name', value: 'followUpAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DashboardApplicationsQuery, DashboardApplicationsQueryVariables>;
export const DashboardCalendarEventsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'DashboardCalendarEvents' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'calendarEvents' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                { kind: 'Field', name: { kind: 'Name', value: 'date' } },
                { kind: 'Field', name: { kind: 'Name', value: 'interviewRoundType' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DashboardCalendarEventsQuery, DashboardCalendarEventsQueryVariables>;
export const WeeklyApplicationGoalDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'WeeklyApplicationGoal' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'weeklyApplicationGoal' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'weeklyApplicationGoal' } },
                { kind: 'Field', name: { kind: 'Name', value: 'currentWeekCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'currentWeekStart' } },
                { kind: 'Field', name: { kind: 'Name', value: 'streakWeeks' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<WeeklyApplicationGoalQuery, WeeklyApplicationGoalQueryVariables>;
export const OnboardingChecklistDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'OnboardingChecklist' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'me' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'onboardingChecklistDismissedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'onboardingGoals' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'aiCredits' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'used' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'limit' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'bonusRemaining' } },
                    ],
                  },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'apiTokens' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'llmApiKeys' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'provider' } }],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'workExperiences' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OnboardingChecklistQuery, OnboardingChecklistQueryVariables>;
export const DismissOnboardingChecklistDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DismissOnboardingChecklist' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'dismissOnboardingChecklist' } },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  DismissOnboardingChecklistMutation,
  DismissOnboardingChecklistMutationVariables
>;
export const GenerateIntoDocumentDraftDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'GenerateIntoDocumentDraft' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'draftId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'instructions' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'resumeDocumentId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'resumeDraftId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'generateIntoDocumentDraft' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'draftId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'draftId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'instructions' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'instructions' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'resumeDocumentId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'resumeDocumentId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'resumeDraftId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'resumeDraftId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'contentJson' } },
                { kind: 'Field', name: { kind: 'Name', value: 'plainText' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GenerateIntoDocumentDraftMutation,
  GenerateIntoDocumentDraftMutationVariables
>;
export const ExtractDocumentTextDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ExtractDocumentText' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'documentId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'extractDocumentText' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'documentId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'documentId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'text' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ExtractDocumentTextMutation, ExtractDocumentTextMutationVariables>;
export const DocumentsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Documents' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'documents' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'mimeType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sizeBytes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                { kind: 'Field', name: { kind: 'Name', value: 'documentType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'version' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DocumentsQuery, DocumentsQueryVariables>;
export const DocumentDraftsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'DocumentDrafts' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'documentDrafts' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'plainText' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DocumentDraftsQuery, DocumentDraftsQueryVariables>;
export const RequestUploadUrlDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RequestUploadUrl' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'RequestUploadUrlInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'requestUploadUrl' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uploadUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'storageKey' } },
                { kind: 'Field', name: { kind: 'Name', value: 'access' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RequestUploadUrlMutation, RequestUploadUrlMutationVariables>;
export const ConfirmDocumentDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ConfirmDocument' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ConfirmDocumentInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'confirmDocument' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'mimeType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sizeBytes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                { kind: 'Field', name: { kind: 'Name', value: 'documentType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'version' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ConfirmDocumentMutation, ConfirmDocumentMutationVariables>;
export const DeleteDocumentDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteDocument' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteDocument' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteDocumentMutation, DeleteDocumentMutationVariables>;
export const DocumentDraftDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'DocumentDraft' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'documentDraft' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'contentJson' } },
                { kind: 'Field', name: { kind: 'Name', value: 'plainText' } },
                { kind: 'Field', name: { kind: 'Name', value: 'sourceDocumentId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'aiInstructions' } },
                { kind: 'Field', name: { kind: 'Name', value: 'aiGenerated' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'myRating' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'rating' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'reason' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DocumentDraftQuery, DocumentDraftQueryVariables>;
export const UpdateDocumentDraftContentDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateDocumentDraftContent' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'UpdateDocumentDraftContentInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateDocumentDraftContent' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateDocumentDraftContentMutation,
  UpdateDocumentDraftContentMutationVariables
>;
export const ExportDocumentDraftToPdfDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ExportDocumentDraftToPdf' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'draftId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'exportDocumentDraftToPdf' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'draftId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'draftId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ExportDocumentDraftToPdfMutation,
  ExportDocumentDraftToPdfMutationVariables
>;
export const RenameDocumentDraftDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RenameDocumentDraft' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'draftId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'title' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'renameDocumentDraft' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'draftId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'draftId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'title' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'title' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RenameDocumentDraftMutation, RenameDocumentDraftMutationVariables>;
export const DeleteDocumentDraftDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteDocumentDraft' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteDocumentDraft' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteDocumentDraftMutation, DeleteDocumentDraftMutationVariables>;
export const DocumentDraftVersionsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'DocumentDraftVersions' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'draftId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'documentDraftVersions' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'draftId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'draftId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                { kind: 'Field', name: { kind: 'Name', value: 'characterCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DocumentDraftVersionsQuery, DocumentDraftVersionsQueryVariables>;
export const DocumentDraftVersionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'DocumentDraftVersion' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'documentDraftVersion' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'source' } },
                { kind: 'Field', name: { kind: 'Name', value: 'plainText' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DocumentDraftVersionQuery, DocumentDraftVersionQueryVariables>;
export const CreateDocumentDraftVersionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateDocumentDraftVersion' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'draftId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createDocumentDraftVersion' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'draftId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'draftId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'source' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateDocumentDraftVersionMutation,
  CreateDocumentDraftVersionMutationVariables
>;
export const RestoreDocumentDraftVersionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RestoreDocumentDraftVersion' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'versionId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'restoreDocumentDraftVersion' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'versionId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'versionId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'contentJson' } },
                { kind: 'Field', name: { kind: 'Name', value: 'plainText' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  RestoreDocumentDraftVersionMutation,
  RestoreDocumentDraftVersionMutationVariables
>;
export const PolishDocumentDraftDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'PolishDocumentDraft' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'draftId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'plainText' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'instructions' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'polishDocumentDraft' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'draftId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'draftId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'plainText' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'plainText' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'instructions' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'instructions' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'markdown' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<PolishDocumentDraftMutation, PolishDocumentDraftMutationVariables>;
export const PostingRequirementsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'PostingRequirements' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'postingRequirements' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'mustHave' } },
                { kind: 'Field', name: { kind: 'Name', value: 'niceToHave' } },
                { kind: 'Field', name: { kind: 'Name', value: 'keywords' } },
                { kind: 'Field', name: { kind: 'Name', value: 'seniority' } },
                { kind: 'Field', name: { kind: 'Name', value: 'generatedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isStale' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<PostingRequirementsQuery, PostingRequirementsQueryVariables>;
export const ExtractPostingRequirementsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ExtractPostingRequirements' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'extractPostingRequirements' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'mustHave' } },
                { kind: 'Field', name: { kind: 'Name', value: 'niceToHave' } },
                { kind: 'Field', name: { kind: 'Name', value: 'keywords' } },
                { kind: 'Field', name: { kind: 'Name', value: 'seniority' } },
                { kind: 'Field', name: { kind: 'Name', value: 'generatedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isStale' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ExtractPostingRequirementsMutation,
  ExtractPostingRequirementsMutationVariables
>;
export const ResumeAtsScoresDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ResumeAtsScores' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'resumeAtsScores' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'documentDraftId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'documentId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'score' } },
                { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                { kind: 'Field', name: { kind: 'Name', value: 'readable' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'checks' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'passed' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'points' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'maxPoints' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'hint' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'generatedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isStale' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ResumeAtsScoresQuery, ResumeAtsScoresQueryVariables>;
export const ComputeResumeAtsScoreDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ComputeResumeAtsScore' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'documentDraftId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'documentId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'computeResumeAtsScore' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'documentDraftId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'documentDraftId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'documentId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'documentId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'documentDraftId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'documentId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'score' } },
                { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                { kind: 'Field', name: { kind: 'Name', value: 'readable' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'checks' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'passed' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'points' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'maxPoints' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'hint' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'generatedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isStale' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ComputeResumeAtsScoreMutation, ComputeResumeAtsScoreMutationVariables>;
export const ResumeGapsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ResumeGaps' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'resumeGaps' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'requirementsRead' } },
                { kind: 'Field', name: { kind: 'Name', value: 'requirementGaps' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'rolesWithoutMetrics' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'workExperienceId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ResumeGapsQuery, ResumeGapsQueryVariables>;
export const DismissResumeGapDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DismissResumeGap' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'key' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'dismissResumeGap' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'key' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'requirementsRead' } },
                { kind: 'Field', name: { kind: 'Name', value: 'requirementGaps' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'rolesWithoutMetrics' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'workExperienceId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DismissResumeGapMutation, DismissResumeGapMutationVariables>;
export const ResumeMatchesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ResumeMatches' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'resumeMatches' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'documentDraftId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'documentId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'score' } },
                { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                { kind: 'Field', name: { kind: 'Name', value: 'matchedKeywords' } },
                { kind: 'Field', name: { kind: 'Name', value: 'missingKeywords' } },
                { kind: 'Field', name: { kind: 'Name', value: 'summary' } },
                { kind: 'Field', name: { kind: 'Name', value: 'generatedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isStale' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ResumeMatchesQuery, ResumeMatchesQueryVariables>;
export const ComputeResumeMatchScoreDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ComputeResumeMatchScore' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'documentDraftId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'documentId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'computeResumeMatchScore' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'documentDraftId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'documentDraftId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'documentId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'documentId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'documentDraftId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'documentId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'score' } },
                { kind: 'Field', name: { kind: 'Name', value: 'label' } },
                { kind: 'Field', name: { kind: 'Name', value: 'matchedKeywords' } },
                { kind: 'Field', name: { kind: 'Name', value: 'missingKeywords' } },
                { kind: 'Field', name: { kind: 'Name', value: 'summary' } },
                { kind: 'Field', name: { kind: 'Name', value: 'generatedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'isStale' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ComputeResumeMatchScoreMutation,
  ComputeResumeMatchScoreMutationVariables
>;
export const CreateDocumentDraftDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateDocumentDraft' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateDocumentDraftInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createDocumentDraft' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateDocumentDraftMutation, CreateDocumentDraftMutationVariables>;
export const InterviewQuestionsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'InterviewQuestions' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'interviewRoundId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'interviewQuestions' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'interviewRoundId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'interviewRoundId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'interviewRoundId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'question' } },
                { kind: 'Field', name: { kind: 'Name', value: 'answer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'position' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<InterviewQuestionsQuery, InterviewQuestionsQueryVariables>;
export const CreateInterviewQuestionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateInterviewQuestion' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'CreateInterviewQuestionInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createInterviewQuestion' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'interviewRoundId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'question' } },
                { kind: 'Field', name: { kind: 'Name', value: 'answer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'position' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateInterviewQuestionMutation,
  CreateInterviewQuestionMutationVariables
>;
export const UpdateInterviewQuestionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateInterviewQuestion' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'UpdateInterviewQuestionInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateInterviewQuestion' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'interviewRoundId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'question' } },
                { kind: 'Field', name: { kind: 'Name', value: 'answer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'position' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateInterviewQuestionMutation,
  UpdateInterviewQuestionMutationVariables
>;
export const DeleteInterviewQuestionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteInterviewQuestion' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteInterviewQuestion' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  DeleteInterviewQuestionMutation,
  DeleteInterviewQuestionMutationVariables
>;
export const ReorderInterviewQuestionsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ReorderInterviewQuestions' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'interviewRoundId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'orderedIds' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'reorderInterviewQuestions' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'interviewRoundId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'interviewRoundId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderedIds' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'orderedIds' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'interviewRoundId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'question' } },
                { kind: 'Field', name: { kind: 'Name', value: 'answer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'position' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ReorderInterviewQuestionsMutation,
  ReorderInterviewQuestionsMutationVariables
>;
export const InterviewRoundsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'InterviewRounds' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'interviewRounds' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                { kind: 'Field', name: { kind: 'Name', value: 'scheduledAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'completedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'interviewerName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'outcome' } },
                { kind: 'Field', name: { kind: 'Name', value: 'questionCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'mockQuestionCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<InterviewRoundsQuery, InterviewRoundsQueryVariables>;
export const CreateInterviewRoundDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateInterviewRound' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateInterviewRoundInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createInterviewRound' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                { kind: 'Field', name: { kind: 'Name', value: 'scheduledAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'completedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'interviewerName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'outcome' } },
                { kind: 'Field', name: { kind: 'Name', value: 'questionCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'mockQuestionCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateInterviewRoundMutation, CreateInterviewRoundMutationVariables>;
export const UpdateInterviewRoundDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateInterviewRound' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateInterviewRoundInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateInterviewRound' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'type' } },
                { kind: 'Field', name: { kind: 'Name', value: 'scheduledAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'completedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'interviewerName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'outcome' } },
                { kind: 'Field', name: { kind: 'Name', value: 'questionCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'mockQuestionCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateInterviewRoundMutation, UpdateInterviewRoundMutationVariables>;
export const DeleteInterviewRoundDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteInterviewRound' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteInterviewRound' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteInterviewRoundMutation, DeleteInterviewRoundMutationVariables>;
export const MockInterviewQuestionsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'MockInterviewQuestions' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'interviewRoundId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'mockInterviewQuestions' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'interviewRoundId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'interviewRoundId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'interviewRoundId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'question' } },
                { kind: 'Field', name: { kind: 'Name', value: 'answer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'answerSource' } },
                { kind: 'Field', name: { kind: 'Name', value: 'talkingPoints' } },
                { kind: 'Field', name: { kind: 'Name', value: 'talkingPointsGeneratedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'position' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<MockInterviewQuestionsQuery, MockInterviewQuestionsQueryVariables>;
export const CreateMockInterviewQuestionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateMockInterviewQuestion' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'CreateMockInterviewQuestionInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createMockInterviewQuestion' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'interviewRoundId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'question' } },
                { kind: 'Field', name: { kind: 'Name', value: 'answer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'answerSource' } },
                { kind: 'Field', name: { kind: 'Name', value: 'talkingPoints' } },
                { kind: 'Field', name: { kind: 'Name', value: 'talkingPointsGeneratedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'position' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  CreateMockInterviewQuestionMutation,
  CreateMockInterviewQuestionMutationVariables
>;
export const UpdateMockInterviewQuestionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateMockInterviewQuestion' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'UpdateMockInterviewQuestionInput' },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateMockInterviewQuestion' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'interviewRoundId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'question' } },
                { kind: 'Field', name: { kind: 'Name', value: 'answer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'answerSource' } },
                { kind: 'Field', name: { kind: 'Name', value: 'talkingPoints' } },
                { kind: 'Field', name: { kind: 'Name', value: 'talkingPointsGeneratedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'position' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateMockInterviewQuestionMutation,
  UpdateMockInterviewQuestionMutationVariables
>;
export const DeleteMockInterviewQuestionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteMockInterviewQuestion' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteMockInterviewQuestion' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  DeleteMockInterviewQuestionMutation,
  DeleteMockInterviewQuestionMutationVariables
>;
export const ReorderMockInterviewQuestionsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ReorderMockInterviewQuestions' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'interviewRoundId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'orderedIds' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'reorderMockInterviewQuestions' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'interviewRoundId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'interviewRoundId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderedIds' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'orderedIds' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'interviewRoundId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'question' } },
                { kind: 'Field', name: { kind: 'Name', value: 'answer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'answerSource' } },
                { kind: 'Field', name: { kind: 'Name', value: 'talkingPoints' } },
                { kind: 'Field', name: { kind: 'Name', value: 'talkingPointsGeneratedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'position' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  ReorderMockInterviewQuestionsMutation,
  ReorderMockInterviewQuestionsMutationVariables
>;
export const GenerateMockInterviewQuestionsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'GenerateMockInterviewQuestions' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'interviewRoundId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'prompt' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'count' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'useProfile' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'documentId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'generateMockInterviewQuestions' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'interviewRoundId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'interviewRoundId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'prompt' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'prompt' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'count' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'count' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'useProfile' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'useProfile' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'documentId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'documentId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'suggestions' } },
                { kind: 'Field', name: { kind: 'Name', value: 'usedJobDescription' } },
                { kind: 'Field', name: { kind: 'Name', value: 'usedBriefing' } },
                { kind: 'Field', name: { kind: 'Name', value: 'usedProfile' } },
                { kind: 'Field', name: { kind: 'Name', value: 'usedDocument' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GenerateMockInterviewQuestionsMutation,
  GenerateMockInterviewQuestionsMutationVariables
>;
export const GenerateMockInterviewAnswerDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'GenerateMockInterviewAnswer' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'mockInterviewQuestionId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'prompt' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'useProfile' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'documentId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'generateMockInterviewAnswer' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'mockInterviewQuestionId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'mockInterviewQuestionId' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'prompt' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'prompt' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'useProfile' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'useProfile' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'documentId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'documentId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'answer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'usedJobDescription' } },
                { kind: 'Field', name: { kind: 'Name', value: 'usedBriefing' } },
                { kind: 'Field', name: { kind: 'Name', value: 'usedProfile' } },
                { kind: 'Field', name: { kind: 'Name', value: 'usedDocument' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GenerateMockInterviewAnswerMutation,
  GenerateMockInterviewAnswerMutationVariables
>;
export const GenerateMockTalkingPointsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'GenerateMockTalkingPoints' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'mockInterviewQuestionId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'prompt' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'useProfile' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'documentId' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'generateMockTalkingPoints' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'mockInterviewQuestionId' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'mockInterviewQuestionId' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'prompt' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'prompt' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'useProfile' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'useProfile' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'documentId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'documentId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'nothingRelevant' } },
                { kind: 'Field', name: { kind: 'Name', value: 'usedProfile' } },
                { kind: 'Field', name: { kind: 'Name', value: 'usedDocument' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'question' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'interviewRoundId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'question' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'answer' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'answerSource' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'talkingPoints' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'talkingPointsGeneratedAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'position' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  GenerateMockTalkingPointsMutation,
  GenerateMockTalkingPointsMutationVariables
>;
export const CreateNoteDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateNote' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'content' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createNote' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'content' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'content' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateNoteMutation, CreateNoteMutationVariables>;
export const UpdateNoteDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateNote' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'content' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateNote' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'content' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'content' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateNoteMutation, UpdateNoteMutationVariables>;
export const DeleteNoteDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteNote' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteNote' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteNoteMutation, DeleteNoteMutationVariables>;
export const NotesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Notes' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'notes' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'content' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<NotesQuery, NotesQueryVariables>;
export const OffersDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Offers' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'offers' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'applicationId' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'applicationId' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                { kind: 'Field', name: { kind: 'Name', value: 'baseSalary' } },
                { kind: 'Field', name: { kind: 'Name', value: 'bonus' } },
                { kind: 'Field', name: { kind: 'Name', value: 'equity' } },
                { kind: 'Field', name: { kind: 'Name', value: 'benefits' } },
                { kind: 'Field', name: { kind: 'Name', value: 'costOfLivingAdjustment' } },
                { kind: 'Field', name: { kind: 'Name', value: 'currency' } },
                { kind: 'Field', name: { kind: 'Name', value: 'period' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<OffersQuery, OffersQueryVariables>;
export const CreateOfferDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateOffer' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateOfferInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createOffer' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateOfferMutation, CreateOfferMutationVariables>;
export const UpdateOfferDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateOffer' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateOfferInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateOffer' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateOfferMutation, UpdateOfferMutationVariables>;
export const DeleteOfferDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteOffer' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteOffer' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteOfferMutation, DeleteOfferMutationVariables>;
export const MyOffersDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'MyOffers' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'myOffers' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'offer' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'applicationId' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'baseSalary' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'bonus' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'equity' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'benefits' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'costOfLivingAdjustment' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currency' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'period' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'notes' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<MyOffersQuery, MyOffersQueryVariables>;
export const CompareOffersDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CompareOffers' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'offerIds' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'compareOffers' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'offerIds' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'offerIds' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'Field',
                  name: { kind: 'Name', value: 'offer' },
                  selectionSet: {
                    kind: 'SelectionSet',
                    selections: [
                      { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'baseSalary' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'bonus' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'equity' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'benefits' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'costOfLivingAdjustment' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'currency' } },
                      { kind: 'Field', name: { kind: 'Name', value: 'period' } },
                    ],
                  },
                },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'normalizedYearlySalary' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totalCompensation' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CompareOffersMutation, CompareOffersMutationVariables>;
export const AwardsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Awards' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'awards' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'issuer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'date' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<AwardsQuery, AwardsQueryVariables>;
export const CreateAwardDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateAward' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateAwardInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createAward' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'issuer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'date' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateAwardMutation, CreateAwardMutationVariables>;
export const UpdateAwardDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateAward' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateAwardInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateAward' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'issuer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'date' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateAwardMutation, UpdateAwardMutationVariables>;
export const DeleteAwardDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteAward' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteAward' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteAwardMutation, DeleteAwardMutationVariables>;
export const CertificationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Certifications' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'certifications' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'issuer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'issuedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expiresAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'credentialUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CertificationsQuery, CertificationsQueryVariables>;
export const CreateCertificationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateCertification' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateCertificationInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createCertification' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'issuer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'issuedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expiresAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'credentialUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateCertificationMutation, CreateCertificationMutationVariables>;
export const UpdateCertificationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateCertification' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateCertificationInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateCertification' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'issuer' } },
                { kind: 'Field', name: { kind: 'Name', value: 'issuedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'expiresAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'credentialUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateCertificationMutation, UpdateCertificationMutationVariables>;
export const DeleteCertificationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteCertification' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteCertification' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteCertificationMutation, DeleteCertificationMutationVariables>;
export const ImportCvProfileDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ImportCvProfile' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ImportCvProfileInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'importCvProfile' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'workExperiences' } },
                { kind: 'Field', name: { kind: 'Name', value: 'educations' } },
                { kind: 'Field', name: { kind: 'Name', value: 'skills' } },
                { kind: 'Field', name: { kind: 'Name', value: 'certifications' } },
                { kind: 'Field', name: { kind: 'Name', value: 'languages' } },
                { kind: 'Field', name: { kind: 'Name', value: 'projects' } },
                { kind: 'Field', name: { kind: 'Name', value: 'awards' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ImportCvProfileMutation, ImportCvProfileMutationVariables>;
export const CvImportSessionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'CvImportSession' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'me' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CvImportSessionQuery, CvImportSessionQueryVariables>;
export const EducationsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Educations' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'educations' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'institution' } },
                { kind: 'Field', name: { kind: 'Name', value: 'degree' } },
                { kind: 'Field', name: { kind: 'Name', value: 'field' } },
                { kind: 'Field', name: { kind: 'Name', value: 'startDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'endDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<EducationsQuery, EducationsQueryVariables>;
export const CreateEducationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateEducation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateEducationInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createEducation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'institution' } },
                { kind: 'Field', name: { kind: 'Name', value: 'degree' } },
                { kind: 'Field', name: { kind: 'Name', value: 'field' } },
                { kind: 'Field', name: { kind: 'Name', value: 'startDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'endDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateEducationMutation, CreateEducationMutationVariables>;
export const UpdateEducationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateEducation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateEducationInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateEducation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'institution' } },
                { kind: 'Field', name: { kind: 'Name', value: 'degree' } },
                { kind: 'Field', name: { kind: 'Name', value: 'field' } },
                { kind: 'Field', name: { kind: 'Name', value: 'startDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'endDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateEducationMutation, UpdateEducationMutationVariables>;
export const DeleteEducationDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteEducation' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteEducation' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteEducationMutation, DeleteEducationMutationVariables>;
export const LanguagesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Languages' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'languages' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'proficiency' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LanguagesQuery, LanguagesQueryVariables>;
export const CreateLanguageDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateLanguage' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateLanguageInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createLanguage' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'proficiency' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateLanguageMutation, CreateLanguageMutationVariables>;
export const UpdateLanguageDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateLanguage' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateLanguageInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateLanguage' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'proficiency' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateLanguageMutation, UpdateLanguageMutationVariables>;
export const DeleteLanguageDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteLanguage' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteLanguage' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteLanguageMutation, DeleteLanguageMutationVariables>;
export const ProjectsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Projects' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'projects' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                { kind: 'Field', name: { kind: 'Name', value: 'startDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'endDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ProjectsQuery, ProjectsQueryVariables>;
export const CreateProjectDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateProject' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateProjectInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createProject' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                { kind: 'Field', name: { kind: 'Name', value: 'startDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'endDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateProjectMutation, CreateProjectMutationVariables>;
export const UpdateProjectDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateProject' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateProjectInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateProject' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'role' } },
                { kind: 'Field', name: { kind: 'Name', value: 'url' } },
                { kind: 'Field', name: { kind: 'Name', value: 'startDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'endDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateProjectMutation, UpdateProjectMutationVariables>;
export const DeleteProjectDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteProject' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteProject' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteProjectMutation, DeleteProjectMutationVariables>;
export const SkillsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Skills' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'skills' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'category' } },
                { kind: 'Field', name: { kind: 'Name', value: 'proficiency' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SkillsQuery, SkillsQueryVariables>;
export const CreateSkillDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateSkill' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateSkillInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createSkill' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'category' } },
                { kind: 'Field', name: { kind: 'Name', value: 'proficiency' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateSkillMutation, CreateSkillMutationVariables>;
export const UpdateSkillDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateSkill' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateSkillInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateSkill' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'category' } },
                { kind: 'Field', name: { kind: 'Name', value: 'proficiency' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateSkillMutation, UpdateSkillMutationVariables>;
export const DeleteSkillDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteSkill' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteSkill' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteSkillMutation, DeleteSkillMutationVariables>;
export const WorkExperiencesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'WorkExperiences' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'workExperiences' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'location' } },
                { kind: 'Field', name: { kind: 'Name', value: 'startDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'endDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<WorkExperiencesQuery, WorkExperiencesQueryVariables>;
export const CreateWorkExperienceDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateWorkExperience' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'CreateWorkExperienceInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createWorkExperience' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'location' } },
                { kind: 'Field', name: { kind: 'Name', value: 'startDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'endDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateWorkExperienceMutation, CreateWorkExperienceMutationVariables>;
export const UpdateWorkExperienceDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateWorkExperience' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'UpdateWorkExperienceInput' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateWorkExperience' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'input' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'input' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'company' } },
                { kind: 'Field', name: { kind: 'Name', value: 'title' } },
                { kind: 'Field', name: { kind: 'Name', value: 'location' } },
                { kind: 'Field', name: { kind: 'Name', value: 'startDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'endDate' } },
                { kind: 'Field', name: { kind: 'Name', value: 'description' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'updatedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateWorkExperienceMutation, UpdateWorkExperienceMutationVariables>;
export const DeleteWorkExperienceDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteWorkExperience' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteWorkExperience' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteWorkExperienceMutation, DeleteWorkExperienceMutationVariables>;
export const MeDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Me' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'me' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'email' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'timezone' } },
                { kind: 'Field', name: { kind: 'Name', value: 'targetRole' } },
                { kind: 'Field', name: { kind: 'Name', value: 'phone' } },
                { kind: 'Field', name: { kind: 'Name', value: 'location' } },
                { kind: 'Field', name: { kind: 'Name', value: 'profileLinks' } },
                { kind: 'Field', name: { kind: 'Name', value: 'avatarUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'backupEmail' } },
                { kind: 'Field', name: { kind: 'Name', value: 'backupEmailVerifiedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'hasPassword' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<MeQuery, MeQueryVariables>;
export const RequestAvatarUploadUrlDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RequestAvatarUploadUrl' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'filename' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'mimeType' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'requestAvatarUploadUrl' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'filename' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'filename' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'mimeType' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'mimeType' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'uploadUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'storageKey' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  RequestAvatarUploadUrlMutation,
  RequestAvatarUploadUrlMutationVariables
>;
export const ConfirmAvatarDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ConfirmAvatar' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'storageKey' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'mimeType' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'sizeBytes' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'confirmAvatar' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'storageKey' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'storageKey' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'mimeType' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'mimeType' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'sizeBytes' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'sizeBytes' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ConfirmAvatarMutation, ConfirmAvatarMutationVariables>;
export const RemoveAvatarDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RemoveAvatar' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'removeAvatar' } }],
      },
    },
  ],
} as unknown as DocumentNode<RemoveAvatarMutation, RemoveAvatarMutationVariables>;
export const UpdateProfileDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateProfile' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'timezone' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'targetRole' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'phone' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'location' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'profileLinks' } },
          type: {
            kind: 'ListType',
            type: {
              kind: 'NonNullType',
              type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'customAiPrompt' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'useCrossApplicationContext' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'llmFallbackWhenLimited' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateProfile' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'name' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'timezone' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'timezone' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'targetRole' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'targetRole' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'phone' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'phone' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'location' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'location' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'profileLinks' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'profileLinks' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'customAiPrompt' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'customAiPrompt' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'useCrossApplicationContext' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'useCrossApplicationContext' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'llmFallbackWhenLimited' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'llmFallbackWhenLimited' },
                },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdateProfileMutation, UpdateProfileMutationVariables>;
export const ExportUserDataDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ExportUserData' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'exportUserData' } }],
      },
    },
  ],
} as unknown as DocumentNode<ExportUserDataQuery, ExportUserDataQueryVariables>;
export const ImportUserDataDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ImportUserData' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'data' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'importUserData' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'data' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'data' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'applicationsImported' } },
                { kind: 'Field', name: { kind: 'Name', value: 'applicationsSkipped' } },
                { kind: 'Field', name: { kind: 'Name', value: 'notesImported' } },
                { kind: 'Field', name: { kind: 'Name', value: 'documentsSkipped' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ImportUserDataMutation, ImportUserDataMutationVariables>;
export const NotificationPreferencesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'NotificationPreferences' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'notificationPreferences' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'weeklyDigestEnabled' } },
                { kind: 'Field', name: { kind: 'Name', value: 'digestFrequency' } },
                { kind: 'Field', name: { kind: 'Name', value: 'followUpRemindersEnabled' } },
                { kind: 'Field', name: { kind: 'Name', value: 'pushNotificationsEnabled' } },
                { kind: 'Field', name: { kind: 'Name', value: 'weeklyApplicationGoal' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<NotificationPreferencesQuery, NotificationPreferencesQueryVariables>;
export const UpdateNotificationPreferencesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdateNotificationPreferences' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'digestFrequency' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'DigestFrequency' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'followUpRemindersEnabled' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'pushNotificationsEnabled' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'weeklyApplicationGoal' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updateNotificationPreferences' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'digestFrequency' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'digestFrequency' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'followUpRemindersEnabled' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'followUpRemindersEnabled' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'pushNotificationsEnabled' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'pushNotificationsEnabled' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'weeklyApplicationGoal' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'weeklyApplicationGoal' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  UpdateNotificationPreferencesMutation,
  UpdateNotificationPreferencesMutationVariables
>;
export const StorageUsageDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'StorageUsage' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'me' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'storageUsedBytes' } },
                { kind: 'Field', name: { kind: 'Name', value: 'storageLimitBytes' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<StorageUsageQuery, StorageUsageQueryVariables>;
export const LlmApiKeysDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'LlmApiKeys' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'llmApiKeys' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'provider' } },
                { kind: 'Field', name: { kind: 'Name', value: 'model' } },
                { kind: 'Field', name: { kind: 'Name', value: 'baseUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'monthlyTokenLimit' } },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'me' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'aiProviderOrder' } },
                { kind: 'Field', name: { kind: 'Name', value: 'customAiPrompt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'useCrossApplicationContext' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LlmApiKeysQuery, LlmApiKeysQueryVariables>;
export const SetAiProviderOrderDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetAiProviderOrder' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'order' } },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'ListType',
              type: {
                kind: 'NonNullType',
                type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
              },
            },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setAiProviderOrder' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'order' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'order' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SetAiProviderOrderMutation, SetAiProviderOrderMutationVariables>;
export const SaveLlmApiKeyDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SaveLlmApiKey' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'provider' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'apiKey' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'model' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'baseUrl' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'saveLlmApiKey' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'provider' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'provider' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'apiKey' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'apiKey' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'model' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'model' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'baseUrl' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'baseUrl' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SaveLlmApiKeyMutation, SaveLlmApiKeyMutationVariables>;
export const DeleteLlmApiKeyDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteLlmApiKey' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'provider' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteLlmApiKey' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'provider' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'provider' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteLlmApiKeyMutation, DeleteLlmApiKeyMutationVariables>;
export const SetLlmApiKeyMonthlyLimitDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'SetLlmApiKeyMonthlyLimit' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'provider' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'monthlyTokenLimit' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'setLlmApiKeyMonthlyLimit' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'provider' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'provider' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'monthlyTokenLimit' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'monthlyTokenLimit' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  SetLlmApiKeyMonthlyLimitMutation,
  SetLlmApiKeyMonthlyLimitMutationVariables
>;
export const TestLlmApiKeyDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'TestLlmApiKey' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'provider' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'apiKey' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'model' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'baseUrl' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'testLlmApiKey' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'provider' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'provider' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'apiKey' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'apiKey' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'model' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'model' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'baseUrl' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'baseUrl' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'ok' } },
                { kind: 'Field', name: { kind: 'Name', value: 'error' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<TestLlmApiKeyMutation, TestLlmApiKeyMutationVariables>;
export const LlmUsageSummaryDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'LlmUsageSummary' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'llmUsageSummary' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'provider' } },
                { kind: 'Field', name: { kind: 'Name', value: 'requestCount' } },
                { kind: 'Field', name: { kind: 'Name', value: 'promptTokens' } },
                { kind: 'Field', name: { kind: 'Name', value: 'completionTokens' } },
                { kind: 'Field', name: { kind: 'Name', value: 'cacheReadTokens' } },
                { kind: 'Field', name: { kind: 'Name', value: 'cacheWriteTokens' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastUsedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'monthlyTokenLimit' } },
                { kind: 'Field', name: { kind: 'Name', value: 'limitReached' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LlmUsageSummaryQuery, LlmUsageSummaryQueryVariables>;
export const ApiTokensDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ApiTokens' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'apiTokens' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'scope' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastUsedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ApiTokensQuery, ApiTokensQueryVariables>;
export const CreateApiTokenDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateApiToken' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'scope' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'ApiTokenScope' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createApiToken' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'name' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'scope' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'scope' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'token' } },
                { kind: 'Field', name: { kind: 'Name', value: 'scope' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateApiTokenMutation, CreateApiTokenMutationVariables>;
export const DeleteApiTokenDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteApiToken' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteApiToken' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteApiTokenMutation, DeleteApiTokenMutationVariables>;
export const McpOAuthGrantsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'McpOAuthGrants' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'mcpOAuthGrants' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'clientName' } },
                { kind: 'Field', name: { kind: 'Name', value: 'scope' } },
                { kind: 'Field', name: { kind: 'Name', value: 'authorizedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastUsedAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<McpOAuthGrantsQuery, McpOAuthGrantsQueryVariables>;
export const RevokeMcpOAuthGrantDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RevokeMcpOAuthGrant' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'revokeMcpOAuthGrant' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RevokeMcpOAuthGrantMutation, RevokeMcpOAuthGrantMutationVariables>;
export const ShareLinksDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ShareLinks' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'shareLinks' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastUsedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ShareLinksQuery, ShareLinksQueryVariables>;
export const CreateShareLinkDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'CreateShareLink' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'createShareLink' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'name' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'name' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'name' } },
                { kind: 'Field', name: { kind: 'Name', value: 'token' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<CreateShareLinkMutation, CreateShareLinkMutationVariables>;
export const DeleteShareLinkDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DeleteShareLink' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'deleteShareLink' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DeleteShareLinkMutation, DeleteShareLinkMutationVariables>;
export const RequestEmailChangeDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RequestEmailChange' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'currentPassword' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'newEmail' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'requestEmailChange' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'currentPassword' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'currentPassword' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'newEmail' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'newEmail' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RequestEmailChangeMutation, RequestEmailChangeMutationVariables>;
export const RequestAddBackupEmailDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RequestAddBackupEmail' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'currentPassword' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'backupEmail' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'requestAddBackupEmail' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'currentPassword' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'currentPassword' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'backupEmail' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'backupEmail' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RequestAddBackupEmailMutation, RequestAddBackupEmailMutationVariables>;
export const RemoveBackupEmailDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RemoveBackupEmail' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'currentPassword' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'removeBackupEmail' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'currentPassword' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'currentPassword' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RemoveBackupEmailMutation, RemoveBackupEmailMutationVariables>;
export const UpdatePasswordDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UpdatePassword' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'currentPassword' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'newPassword' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'updatePassword' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'currentPassword' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'currentPassword' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'newPassword' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'newPassword' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UpdatePasswordMutation, UpdatePasswordMutationVariables>;
export const ReauthenticateDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'Reauthenticate' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'reauthenticate' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'password' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'code' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'success' } },
                { kind: 'Field', name: { kind: 'Name', value: 'totpRequired' } },
                { kind: 'Field', name: { kind: 'Name', value: 'accessToken' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ReauthenticateMutation, ReauthenticateMutationVariables>;
export const SecurityActivityDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'SecurityActivity' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'securityActivity' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'eventType' } },
                { kind: 'Field', name: { kind: 'Name', value: 'ipAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'userAgent' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SecurityActivityQuery, SecurityActivityQueryVariables>;
export const SessionsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Sessions' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'sessions' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                { kind: 'Field', name: { kind: 'Name', value: 'userAgent' } },
                { kind: 'Field', name: { kind: 'Name', value: 'ipAddress' } },
                { kind: 'Field', name: { kind: 'Name', value: 'deviceLabel' } },
                { kind: 'Field', name: { kind: 'Name', value: 'location' } },
                { kind: 'Field', name: { kind: 'Name', value: 'lastUsedAt' } },
                { kind: 'Field', name: { kind: 'Name', value: 'current' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<SessionsQuery, SessionsQueryVariables>;
export const RevokeSessionDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RevokeSession' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'ID' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'revokeSession' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'id' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'id' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<RevokeSessionMutation, RevokeSessionMutationVariables>;
export const RevokeOtherSessionsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RevokeOtherSessions' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'revokeOtherSessions' } }],
      },
    },
  ],
} as unknown as DocumentNode<RevokeOtherSessionsMutation, RevokeOtherSessionsMutationVariables>;
export const TotpEnabledDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'TotpEnabled' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'totpEnabled' } }],
      },
    },
  ],
} as unknown as DocumentNode<TotpEnabledQuery, TotpEnabledQueryVariables>;
export const BeginTotpSetupDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'BeginTotpSetup' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'beginTotpSetup' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'password' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'secret' } },
                { kind: 'Field', name: { kind: 'Name', value: 'otpauthUrl' } },
                { kind: 'Field', name: { kind: 'Name', value: 'qrCodeDataUrl' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<BeginTotpSetupMutation, BeginTotpSetupMutationVariables>;
export const ConfirmTotpSetupDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'ConfirmTotpSetup' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'confirmTotpSetup' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'code' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'backupCodes' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<ConfirmTotpSetupMutation, ConfirmTotpSetupMutationVariables>;
export const DisableTotpDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'DisableTotp' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'disableTotp' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'password' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'password' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<DisableTotpMutation, DisableTotpMutationVariables>;
export const RegenerateTotpBackupCodesDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RegenerateTotpBackupCodes' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'currentPassword' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'regenerateTotpBackupCodes' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'currentPassword' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'currentPassword' } },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'backupCodes' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<
  RegenerateTotpBackupCodesMutation,
  RegenerateTotpBackupCodesMutationVariables
>;
export const LinkedOAuthAccountsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'LinkedOAuthAccounts' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'linkedOAuthAccounts' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'provider' } },
                { kind: 'Field', name: { kind: 'Name', value: 'email' } },
                { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
              ],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<LinkedOAuthAccountsQuery, LinkedOAuthAccountsQueryVariables>;
export const UnlinkOAuthAccountDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'UnlinkOAuthAccount' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'provider' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'OAuthProvider' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'unlinkOAuthAccount' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'provider' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'provider' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<UnlinkOAuthAccountMutation, UnlinkOAuthAccountMutationVariables>;
export const StepUpMethodsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'StepUpMethods' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'me' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [{ kind: 'Field', name: { kind: 'Name', value: 'stepUpMethods' } }],
            },
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<StepUpMethodsQuery, StepUpMethodsQueryVariables>;
export const StartOAuthReauthDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'StartOAuthReauth' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'provider' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'OAuthProvider' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'startOAuthReauth' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'provider' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'provider' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<StartOAuthReauthMutation, StartOAuthReauthMutationVariables>;
export const RequestStepUpCodeDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'RequestStepUpCode' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'requestStepUpCode' } }],
      },
    },
  ],
} as unknown as DocumentNode<RequestStepUpCodeMutation, RequestStepUpCodeMutationVariables>;
export const VerifyStepUpCodeDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'mutation',
      name: { kind: 'Name', value: 'VerifyStepUpCode' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
          type: {
            kind: 'NonNullType',
            type: { kind: 'NamedType', name: { kind: 'Name', value: 'String' } },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'verifyStepUpCode' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'code' },
                value: { kind: 'Variable', name: { kind: 'Name', value: 'code' } },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode<VerifyStepUpCodeMutation, VerifyStepUpCodeMutationVariables>;
