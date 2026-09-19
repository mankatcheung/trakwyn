import type { NameAndRegistrationPair } from 'awilix';

import { auth } from './auth.js';
import { oauth } from './oauth.js';
import { user } from './user.js';
import { jobs } from './jobs.js';
import { notes } from './notes.js';
import { documents } from './documents.js';
import { interviews } from './interviews.js';
import { activity } from './activity.js';
import { chat } from './chat.js';
import { apiTokens } from './apiTokens.js';
import { shareLinks } from './shareLinks.js';
import { notifications } from './notifications.js';
import { contacts } from './contacts.js';
import { sessions } from './sessions.js';
import { push } from './push.js';
import { profile } from './profile.js';
import { offers } from './offers.js';
import { analytics } from './analytics.js';
import { llm } from './llm.js';
import { mcpOAuth } from './mcpOAuth.js';
import { cookieConsent } from './cookieConsent.js';
import { calendar } from './calendar.js';

import type { Cradle } from '../types.js';

export const useCases = {
  ...auth,
  ...oauth,
  ...user,
  ...jobs,
  ...notes,
  ...documents,
  ...interviews,
  ...activity,
  ...chat,
  ...apiTokens,
  ...shareLinks,
  ...notifications,
  ...contacts,
  ...sessions,
  ...push,
  ...profile,
  ...offers,
  ...analytics,
  ...llm,
  ...mcpOAuth,
  ...cookieConsent,
  ...calendar,
} satisfies NameAndRegistrationPair<Cradle>;
