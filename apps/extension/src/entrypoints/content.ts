import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { parseJobPage } from '../lib/parsers/index';
import { CONTENT_MESSAGES } from '../constants';

export default defineContentScript({
  matches: [
    'https://www.linkedin.com/jobs/*',
    'https://*.indeed.com/viewjob*',
    'https://*.indeed.com/jobs*',
    'https://*.glassdoor.com/job-listing/*',
    'https://*.greenhouse.io/jobs/*',
    'https://*.lever.co/*',
    'https://*.workday.com/*',
    'https://*.myworkdayjobs.com/*',
  ],
  runAt: 'document_idle',
  main() {
    // Answer with a promise rather than `sendResponse` + `return true`, which
    // Safari's `browser.runtime.onMessage` does not honour reliably.
    browser.runtime.onMessage.addListener((message: { type?: string }) => {
      if (message.type !== CONTENT_MESSAGES.GET_JOB_DATA) return undefined;
      return Promise.resolve({ jobData: parseJobPage() });
    });
  },
});
