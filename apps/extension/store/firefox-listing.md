# Firefox Add-ons (AMO) listing (JEF-423)

The copy and answers entered on addons.mozilla.org for the Trakwyn Clipper (add-on ID `clipper@trakwyn.com`, permanent once published). Change it here, in a PR, then paste it into the Developer Hub. The store copy follows `listing.md`, including its rule against naming individual job boards in the metadata (the Web Store rejected 1.0.0 for it, JEF-418); the hosts belong in the permission justification only.

`src/__tests__/firefoxListing.test.ts` holds the limits below and that every manifest permission is justified. The data declarations must match the manifest's `data_collection_permissions` (`manifest.ts`), `listing.md` and the privacy policy. Change all of them together.

## Listing

### Name

Trakwyn Clipper

### Summary

Save job postings from the job sites you browse to your Trakwyn job search tracker in one click.

### Description

Trakwyn Clipper saves the job posting you are looking at to your Trakwyn account, so your job search stays in one place.

Open the Clipper on a job posting and it reads the title, company, location and description. Check the details, fix anything that is off, and save it as an application in Trakwyn. No copying and pasting between tabs.

HOW IT WORKS
• Works on job pages from the most popular job sites and applicant tracking systems.
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

### Categories

Productivity

### Support email

contact@trakwyn.com

### Support website

https://www.trakwyn.com/

### Privacy policy URL

https://www.trakwyn.com/privacy

### License

All Rights Reserved

### Screenshots

Reuse `store/assets/screenshot-1-clip.png` and `store/assets/screenshot-2-saved.png` (AMO takes any size; these are 1280×800). Do not name individual sites in captions.

## Permissions

### Permission justifications

#### `storage`

Keeps the user's sign-in state. The access token stays in session storage. The refresh token is also written to local storage only if the user ticks “Keep me signed in” when signing in, so they stay signed in after a browser restart; signing out removes it. The signed-in user's name, email and avatar link are also kept in session storage so the popup can show who is signed in before the API answers; they are cleared with the session. Nothing else is stored.

#### `activeTab`

Lets the Clipper read the job page the user chose to clip, only when they open the Clipper on it. It does not read any other tab.

#### `tabs`

Signs the user in with Google or GitHub. The sign-in opens in a tab, and the Clipper reads that one tab's address to see when it reaches the Trakwyn API's finish page, then closes it. The address carries a one-time code that the Clipper exchanges with the Trakwyn API for the user's session. It reads no other tab's address.

#### Content script hosts

The same as `listing.md` (`#### Content script hosts`): the content script runs only on the job pages it matches, answers only when the Clipper asks for the posting, and requests no host permission beyond those matches.

### Data collection declaration

`manifest.json` declares, as required: `personallyIdentifyingInfo` (the signed-in user's name and email), `authenticationInfo` (the sign-in credentials and session tokens, sent only to the Trakwyn API) and `websiteContent` (the job posting the user clips and, only on Read with AI, the page text). Nothing is optional. Anonymous error reports carry none of these.

## Submission

### Source code

AMO needs the source because the bundle is minified. Upload `trakwynextension-<version>-sources.zip` (`pnpm --filter @trakwyn/extension zip:firefox` writes it beside the add-on zip). It is rooted at the monorepo with only `apps/extension`, the lockfile and the workspace files, and building it gives the same bundle as the add-on zip.

Build notes for the reviewer:

1. Node 24 and pnpm 11 (`package.json` `packageManager`).
2. `pnpm install --frozen-lockfile`
3. `cd apps/extension`, with no `.env` file present.
4. `VITE_API_URL=<the production /graphql URL> VITE_POSTHOG_KEY=<the public key> pnpm zip:firefox`
5. The add-on is `.output/trakwynextension-<version>-firefox.zip`.

Give the reviewer the real `VITE_API_URL` and the public `VITE_POSTHOG_KEY`; they are inlined into the bundle, so a different value is a different file.

### Notes for the reviewer

- Sign-in needs a Trakwyn account: provide a demo account (email and password) in the notes.
- `tabs` is used only for the Google/GitHub sign-in tab, as justified above. `identity` is deliberately absent.
- The add-on makes network requests only to the Trakwyn API, to the user's own AI provider through that API, and anonymous error reports to PostHog.
