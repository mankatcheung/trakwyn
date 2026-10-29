/**
 * User mutations, registered by concern.
 *
 * This file was 498 lines holding 21 unrelated mutations — email changes,
 * passwords, TOTP, BYOK provider keys, profile and avatar — in one module
 * (JEF-255). It stays the single registration point so `schema/index.ts` and
 * the order mutations reach the builder are unchanged.
 */

import './user/emailMutations.js';
import './user/accountMutations.js';
import './user/accountDeletionMutations.js';
import './user/totpMutations.js';
import './user/llmApiKeyMutations.js';
import './user/profileMutations.js';
