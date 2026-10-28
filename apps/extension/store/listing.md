# Chrome Web Store listing (JEF-416)

The copy and answers entered in the Chrome Web Store developer dashboard for the Trakwyn Clipper (ID `pnpgngnojencbggokjhpfhmliijakmhe`). Change it here, in a PR, then paste it into the dashboard: the store keeps no history.

`src/__tests__/storeListing.test.ts` holds the limits below, that every manifest permission has a justification, and the asset sizes. The disclosures must match what the extension really does (`CLAUDE.md`) and what the privacy policy says (`apps/web/src/routes/-components/PrivacyPage.tsx`, "The Trakwyn Clipper browser extension"). Change all three together.

## Store listing tab

### Title

Trakwyn Clipper

### Short description

Save the job posting you're viewing to your Trakwyn job search tracker in one click.

### Full description

Trakwyn Clipper saves the job posting you are looking at to your Trakwyn account, so your job search stays in one place.

Open the Clipper on a job posting and it reads the title, company, location and description. Check the details, fix anything that is off, and save it as an application in Trakwyn. No copying and pasting between tabs.

HOW IT WORKS
• Works on job pages from supported job boards and company career sites.
• Read with parser: the built-in reader fills in the posting instantly.
• Read with AI: for a page the parser gets wrong, let your own AI provider read it instead. This needs an AI key saved in Trakwyn, and the page text is sent only when you press the button.
• You review the posting before anything is saved.
• Sign in with your email, Google or GitHub.

PRIVACY
• Reads a page only when you open the Clipper on a supported job site. Nothing is sent until you save.
• Your sign-in is kept in the browser's session storage and sent only to the Trakwyn API. If you choose “Keep me signed in”, the refresh token is also kept in local storage on your device so you stay signed in after a restart.
• Anonymous error reports contain no personal data, no tokens, no job content and no page addresses.
• Your data is never sold.

You need a Trakwyn account (free to create at www.trakwyn.com). Privacy policy: https://www.trakwyn.com/privacy

### Category

Productivity > Workflow & Planning

### Language

English

### Support URL

https://www.trakwyn.com/

### Contact email

contact@trakwyn.com

### Privacy policy URL

https://www.trakwyn.com/privacy

### Graphic assets

| Dashboard slot   | File                                  | Size     |
| ---------------- | ------------------------------------- | -------- |
| Store icon       | `public/icons/icon128.png`            | 128×128  |
| Screenshot 1     | `store/assets/screenshot-1-clip.png`  | 1280×800 |
| Screenshot 2     | `store/assets/screenshot-2-saved.png` | 1280×800 |
| Small promo tile | `store/assets/promo-tile-small.png`   | 440×280  |

The screenshots are the real built popup and content script running against a demo posting for a made-up company ("Northwind Labs"), with a stand-in signed-in account and API answers. They are 24-bit PNG with no alpha. To redo them after a popup change, rebuild, load the build in Chromium, and capture the popup beside the demo page.

## Privacy practices tab

### Single purpose

Save job postings from supported job boards to the user's Trakwyn account.

### Permission justifications

#### `storage`

Keeps the user's sign-in state. The access token stays in session storage. The refresh token is also written to local storage only if the user ticks “Keep me signed in” when signing in, so they stay signed in after a browser restart; signing out removes it. The signed-in user's name, email and avatar link are also kept in session storage so the popup can show who is signed in before the API answers; they are cleared with the session. Nothing else is stored.

#### `activeTab`

Lets the Clipper read the job page the user chose to clip, only when they open the Clipper on it. It does not read any other tab.

#### `identity`

Signs the user in with Google or GitHub through `chrome.identity.launchWebAuthFlow`. The result is a one-time code that the Clipper exchanges with the Trakwyn API for the user's session.

#### Content script hosts

The content script runs on `https://www.linkedin.com/jobs/*`, `https://*.indeed.com/jobs*` and `viewjob*`, `https://*.glassdoor.com/job-listing/*`, `https://*.greenhouse.io/jobs/*`, `https://*.lever.co/*`, `https://*.workday.com/*` and `https://*.myworkdayjobs.com/*`. It detects and parses a job posting on those pages, and only answers when the Clipper asks for the posting. It never sends anything itself and requests no host permission beyond these matches.

### Remote code

No, this extension does not use remote code. All JavaScript ships in the package.

### Data usage

Tick these categories:

- **Personally identifiable information**: the signed-in user's name and email, shown in the popup and held only as part of their session.
- **Authentication information**: the user's sign-in credentials (email and password, or the Google/GitHub sign-in result) and the session tokens, sent only to the Trakwyn API. With “Keep me signed in” the refresh token also stays on the user's device in local storage.
- **Website content**: the job posting the user clips (title, company, location, description and link) and, only if they press Read with AI, the page text.

Leave the other categories unticked, including **Personal communications**: the Clipper reads job postings and no messages or email. Anonymous error reports carry no data in any of these categories (they name the job board and an error, never content or a person).

### Data-use certifications

Tick all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

The approved use cases cover what the Clipper does: user data goes only to the Trakwyn API (the single purpose), to the AI provider the user chose (when they press Read with AI), and to the error-monitoring provider (anonymous reports only).

## Release notes for the submission

- Build the upload zip without a local `.env` (see `.env.example`): and set `VITE_API_URL` to the production API explicitly (the release workflow does, from `CLIPPER_API_URL`): the URL is no longer in the source, and a stray one from a `.env` would be baked into the bundle. Set the public `VITE_POSTHOG_KEY` for the store build, because the privacy policy says the Clipper sends anonymous error reports.
- The submission and rollout are a separate issue.

## Review history

- **1.0.0, rejected (2026-10-22): keyword spam** (violation ref "Yellow Argon"). The short description and the full description's "How it works" list both named "LinkedIn, Indeed, Glassdoor, Greenhouse, Lever and Workday", which the store treats as excessive or irrelevant keywords in the item's metadata. Fixed by describing the supported sites generically in the title, short description and full description. The hosts stay in the permission justification (`#### Content script hosts`), where the dashboard asks for them. `storeListing.test.ts` fails if a board name comes back into the descriptions. Do not name individual sites in the screenshots' or promo tile's text either.
