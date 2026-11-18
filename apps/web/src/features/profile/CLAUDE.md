# Profile: CV import

Loaded when working under `apps/web/src/routes/_authenticated/profile`. The rest of the web notes are in `apps/web/CLAUDE.md`. Paths are relative to `apps/web/src/` unless stated.

## Where things live (JEF-643)

- **The page** is `pages/ProfilePage.tsx`; the route only wires the `returnTo` search param.
- **Documents** are typed `graphql()` calls in `graphql/`, one file per section (`workExperienceQueries.ts`, `educationQueries.ts`, `skillQueries.ts` and so on), each with its row type and `queryOptions`. `cvImportQueries.ts` holds the import mutation and the session probe.
- **The CV review** (`components/cv-import/CvImportReview.tsx`) renders one group per section from `review/`: `ExperienceReviewGroups.tsx` (work, education, projects), `CredentialReviewGroups.tsx` (skills, certifications, awards, languages), the shared `ReviewGroup` and the field components.

## CV import (JEF-461)

The profile page's "Import from CV" button opens `CvImportDialog` (`components/cv-import/`): choose a file, read it, review the entries, save the ticked ones. The API side is in `apps/api/src/use-cases/profile/CLAUDE.md`.

- **The upload is a plain `fetch`, not `gqlClient`** (`lib/cvImport.ts`): multipart to `CV_IMPORT_URL`, derived from `VITE_API_URL` like the chat stream's. It sends `credentials: 'include'`, the required `x-trakwyn-upload` header (the API's CSRF guard, which must match its constant) and no `Content-Type`, so the browser adds the multipart boundary. The vite dev proxy has an entry for `/profile/cv-import`, which is exact enough not to catch the web app's own `/profile` routes.
- **A 401 is refreshed and retried once** through an ordinary GraphQL call, since a plain `fetch` has no refresh of its own and the access token is short-lived; if the refresh fails, `gqlClient` has already signed the user out.
- **The file is checked in the browser first** (type, `.doc`, empty, 10 MB) so a wrong file is turned away with no request. The input's `accept` lists extensions as well as types because some systems report no type for `.docx`; `resolveCvMimeType` retypes the part from the extension for the same reason. The API repeats every check.
- **Review state is plain data** (`cvImportDrafts.ts`): rows start ticked unless the profile already has them (`alreadyInProfile`), a ticked row that has been edited into something invalid blocks Import, and only ticked rows are sent. Save guards a double click with a ref, because the API would add every row twice.
- **The four newer sections (JEF-592)** are review groups of their own (projects, certifications, awards, languages) in the same `Draft` shape. Their dates may be blank, so they use `MonthField`, not `DateFields`, and `cvImportDrafts` has a validity rule for each. `toImportInput` leaves a section out of the mutation when nothing in it is ticked, so a CV without them sends exactly what it did before, and the success toast names the extra entries only when there are some (`cvImport.successWithOther`).
