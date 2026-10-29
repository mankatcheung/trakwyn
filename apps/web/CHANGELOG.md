# Changelog

## [0.9.0](https://github.com/mankatcheung/trakwyn/compare/web-v0.8.0...web-v0.9.0) (2026-10-29)


### Features

* add a first-run welcome flow and an empty-profile prompt (JEF-460) ([#1123](https://github.com/mankatcheung/trakwyn/issues/1123)) ([fb6fe9e](https://github.com/mankatcheung/trakwyn/commit/fb6fe9e90be8eb5aec4a682bae15faef357373eb))
* attribute MCP write-tool changes to the calling token (JEF-466) ([#1129](https://github.com/mankatcheung/trakwyn/issues/1129)) ([33e1483](https://github.com/mankatcheung/trakwyn/commit/33e14836e1416e3088105635c49c216adf1ddf84))
* harden account deletion with step-up for every sign-in method, email confirmation and a 14-day grace period (JEF-463) ([#1133](https://github.com/mankatcheung/trakwyn/issues/1133)) ([16e6594](https://github.com/mankatcheung/trakwyn/commit/16e6594e3ce49bfcfad44c0ee2a98ef186f75b01))
* let the chat assistant propose writes the user confirms (JEF-469) ([#1132](https://github.com/mankatcheung/trakwyn/issues/1132)) ([253c0bc](https://github.com/mankatcheung/trakwyn/commit/253c0bcd6521cfb522b58af9c71b94e5855d0099))


### Bug Fixes

* never load images or unsafe URLs from AI-rendered markdown (JEF-464) ([#1126](https://github.com/mankatcheung/trakwyn/issues/1126)) ([a205447](https://github.com/mankatcheung/trakwyn/commit/a205447e0116793dd88355f650bf19ec465f1420))

## [0.8.0](https://github.com/mankatcheung/trakwyn/compare/web-v0.7.0...web-v0.8.0) (2026-10-28)


### Features

* import the profile from an uploaded CV (JEF-461) ([#1113](https://github.com/mankatcheung/trakwyn/issues/1113)) ([6167a56](https://github.com/mankatcheung/trakwyn/commit/6167a5615fa5c6896559708e979b8794a07fe71a))
* **web:** move the CV profile out of Settings to its own page (JEF-459) ([#1108](https://github.com/mankatcheung/trakwyn/issues/1108)) ([66631cc](https://github.com/mankatcheung/trakwyn/commit/66631ccb039e62f2444d75694cb8d6fa490509b9))


### Bug Fixes

* **web:** send a 1200×630 social card as the link preview (JEF-462) ([#1112](https://github.com/mankatcheung/trakwyn/issues/1112)) ([a6ba476](https://github.com/mankatcheung/trakwyn/commit/a6ba476402b5e85431841f5d3fdbba54274e8ce1))

## [0.7.0](https://github.com/mankatcheung/trakwyn/compare/web-v0.6.0...web-v0.7.0) (2026-10-28)


### Features

* show the current email in the web settings Email address section (JEF-456) ([#1099](https://github.com/mankatcheung/trakwyn/issues/1099)) ([f16f094](https://github.com/mankatcheung/trakwyn/commit/f16f094ecdf8b7a9bb81ba3d9ff0d2c6a5b5de81))


### Bug Fixes

* stop the sign-in loop when a refresh fails with the session hint cookie set ([#1094](https://github.com/mankatcheung/trakwyn/issues/1094)) ([bb4ba9a](https://github.com/mankatcheung/trakwyn/commit/bb4ba9a978431e418dfd5dad31d2d26380ad455f))
* **web:** stop stale-chunk reload from resolving route imports to undefined ([#1098](https://github.com/mankatcheung/trakwyn/issues/1098)) ([6af1301](https://github.com/mankatcheung/trakwyn/commit/6af1301810527e9acb354ddc7c067339fc272a51))


### Performance Improvements

* **extension:** show the Clipper popup's clip before the API answers (JEF-457) ([#1103](https://github.com/mankatcheung/trakwyn/issues/1103)) ([6870a71](https://github.com/mankatcheung/trakwyn/commit/6870a71865d0aad950980d85f9e0cb9b626b9f8b))

## [0.6.0](https://github.com/mankatcheung/trakwyn/compare/web-v0.5.0...web-v0.6.0) (2026-10-27)


### Features

* add a public pricing page and update marketing copy for paid plans (JEF-441) ([#1071](https://github.com/mankatcheung/trakwyn/issues/1071)) ([82bbbd9](https://github.com/mankatcheung/trakwyn/commit/82bbbd92a672689992feb90dd4981b04768830f8))
* add paid-plan terms, privacy and pricing copy (JEF-431) ([#1069](https://github.com/mankatcheung/trakwyn/issues/1069)) ([0f6fe48](https://github.com/mankatcheung/trakwyn/commit/0f6fe486c26a264889b0a10613f010fbe01be19b))
* make bring-your-own-key AI actions and MCP available on Free (JEF-442) ([#1073](https://github.com/mankatcheung/trakwyn/issues/1073)) ([2a3aec5](https://github.com/mankatcheung/trakwyn/commit/2a3aec5de5f14384d5e4e28031a05ce37077f68d))
* revoke the Polar subscription when a user deletes their account (JEF-439) ([#1067](https://github.com/mankatcheung/trakwyn/issues/1067)) ([4074f19](https://github.com/mankatcheung/trakwyn/commit/4074f191ba57d5a76a278ffd36d504846d95b6a4))
* take payment for Pro behind a provider-neutral billing port (JEF-426) ([#1049](https://github.com/mankatcheung/trakwyn/issues/1049)) ([7a45437](https://github.com/mankatcheung/trakwyn/commit/7a45437b840df8e4036187529a92796ce04495e8))


### Bug Fixes

* block unverified email accounts behind a verification wall (JEF-438) ([#1063](https://github.com/mankatcheung/trakwyn/issues/1063)) ([8b0ee3e](https://github.com/mankatcheung/trakwyn/commit/8b0ee3e057e733a380acb00e0187cca00fabf820))
* **deps:** clear all open Dependabot alerts via overrides and a lockfile bump ([#1088](https://github.com/mankatcheung/trakwyn/issues/1088)) ([59cd6d4](https://github.com/mankatcheung/trakwyn/commit/59cd6d45b4f4a4f979acc97cb075ca6d8def6873))

## [0.5.0](https://github.com/mankatcheung/trakwyn/compare/web-v0.4.0...web-v0.5.0) (2026-10-23)


### Features

* add Free and Pro plans, entitlements and tier enforcement (JEF-344) ([#1038](https://github.com/mankatcheung/trakwyn/issues/1038)) ([9efb7ec](https://github.com/mankatcheung/trakwyn/commit/9efb7eccc64bf2f5eabd6bed629a812fbc9761be))
* cap total document storage per user and show usage (JEF-425) ([#1034](https://github.com/mankatcheung/trakwyn/issues/1034)) ([d6e8d77](https://github.com/mankatcheung/trakwyn/commit/d6e8d77f30d678f2920a1df1be1b5756beb1956c))

## [0.4.0](https://github.com/mankatcheung/trakwyn/compare/web-v0.3.0...web-v0.4.0) (2026-10-23)


### Features

* **web:** promote the Chrome Web Store Clipper on the marketing site (JEF-424) ([#1032](https://github.com/mankatcheung/trakwyn/issues/1032)) ([ff16161](https://github.com/mankatcheung/trakwyn/commit/ff16161d85ff72904ca74a91dcb01011a62535f8))

## [0.3.0](https://github.com/mankatcheung/trakwyn/compare/web-v0.2.1...web-v0.3.0) (2026-10-22)


### Miscellaneous Chores

* **web:** Synchronize server versions

## [0.2.1](https://github.com/mankatcheung/trakwyn/compare/web-v0.2.0...web-v0.2.1) (2026-10-20)


### Bug Fixes

* **web:** reload once when a stale tab can't fetch a deployed chunk ([#1002](https://github.com/mankatcheung/trakwyn/issues/1002)) ([013c92c](https://github.com/mankatcheung/trakwyn/commit/013c92c0f33f1e7bb5f626a4f1a959725ff63b8e))

## [0.2.0](https://github.com/mankatcheung/trakwyn/compare/web-v0.1.0...web-v0.2.0) (2026-10-16)


### Features

* ATS-readiness score for uploaded and created resumes, saved per resume (JEF-395) ([#959](https://github.com/mankatcheung/trakwyn/issues/959)) ([5adf194](https://github.com/mankatcheung/trakwyn/commit/5adf1940c010e0e4d9570631f2f47f0161b7e7de))
* captcha and rate limits on register, login and password reset (JEF-401) ([#964](https://github.com/mankatcheung/trakwyn/issues/964)) ([88448fa](https://github.com/mankatcheung/trakwyn/commit/88448faa8b87d4cf89b8522942162f70c572be20))
* **extension:** error reporting and trace correlation for the Trakwyn Clipper (JEF-387) ([#929](https://github.com/mankatcheung/trakwyn/issues/929)) ([f0d9050](https://github.com/mankatcheung/trakwyn/commit/f0d90509ce0901ca73aa622528653300371aba6d))
* horizontal section tabs and a wider page on wide web screens (JEF-402) ([#967](https://github.com/mankatcheung/trakwyn/issues/967)) ([ad3f1b9](https://github.com/mankatcheung/trakwyn/commit/ad3f1b94770d35cb78f8674116c13b33356d6965))
* Overview tab on wide web screens and collapsed job description on mobile (JEF-403) ([#969](https://github.com/mankatcheung/trakwyn/issues/969)) ([1b3e0bb](https://github.com/mankatcheung/trakwyn/commit/1b3e0bb782bd94d28720aeb7df9814c592604a62))
* practice interview questions and AI answers (JEF-393) ([#944](https://github.com/mankatcheung/trakwyn/issues/944)) ([dfdd213](https://github.com/mankatcheung/trakwyn/commit/dfdd2135b7df37b1e3e2bbefd5f9b459ce9ad314))
* record questions and responses per interview round (JEF-392) ([#940](https://github.com/mankatcheung/trakwyn/issues/940)) ([074c688](https://github.com/mankatcheung/trakwyn/commit/074c68865b23c82ad47d355564594b4417265f45))
* render the company briefing as markdown on web and mobile (JEF-391) ([#937](https://github.com/mankatcheung/trakwyn/issues/937)) ([5dc1bf1](https://github.com/mankatcheung/trakwyn/commit/5dc1bf1e1b0cfd26bb1e51dd2af419bd7618d329))
* save resume match per resume and move it into the Resumes tab (JEF-397) ([#952](https://github.com/mankatcheung/trakwyn/issues/952)) ([b4bcc63](https://github.com/mankatcheung/trakwyn/commit/b4bcc63c7883982664b1d206560027262ca61434))
* section counts on mobile and a generated marker for Company Briefing (JEF-398) ([#953](https://github.com/mankatcheung/trakwyn/issues/953)) ([1295273](https://github.com/mankatcheung/trakwyn/commit/129527350283e67890c8174328f5586dc609bab0))
* show a popover for the actions button on wide application detail pages (JEF-404) ([#972](https://github.com/mankatcheung/trakwyn/issues/972)) ([52f92d8](https://github.com/mankatcheung/trakwyn/commit/52f92d88f44572c1dab495732efc0e175b712a76))
* show drafts and files in one list on the resume and cover letter tabs (JEF-399) ([#955](https://github.com/mankatcheung/trakwyn/issues/955)) ([872a81e](https://github.com/mankatcheung/trakwyn/commit/872a81ee02effb93804dc30b1fd639653e23744e))
* split documents into cover letters, resumes and other documents (JEF-396) ([#949](https://github.com/mankatcheung/trakwyn/issues/949)) ([cb4a6fc](https://github.com/mankatcheung/trakwyn/commit/cb4a6fcb1bf7c647babee5b734aff8e85d2fa87c))
* store documents in a private Blob store (JEF-51) ([#957](https://github.com/mankatcheung/trakwyn/issues/957)) ([085ac9d](https://github.com/mankatcheung/trakwyn/commit/085ac9df6bcd9e7ef0c3c025043ce1a1c9afda4b))
* toolbar above filter, row actions in the more menu, ATS and match details in modals (JEF-405) ([#974](https://github.com/mankatcheung/trakwyn/issues/974)) ([afd6775](https://github.com/mankatcheung/trakwyn/commit/afd677546a95c7eb2c32a56c3df4a3d7c44da3c8))


### Bug Fixes

* bring back the section sidebar at lg so no tab needs scrolling to (JEF-411) ([#986](https://github.com/mankatcheung/trakwyn/issues/986)) ([1d825be](https://github.com/mankatcheung/trakwyn/commit/1d825be3b862849a25ab5f14d43efb7f00594b39))
* resume ATS e2e reads the checklist from the modal (JEF-405) ([#977](https://github.com/mankatcheung/trakwyn/issues/977)) ([a4a544d](https://github.com/mankatcheung/trakwyn/commit/a4a544d1d2a64a961e834c8db836cf36543084f7))
* **web:** don't report GraphQL fetch failures while the browser is offline ([#947](https://github.com/mankatcheung/trakwyn/issues/947)) ([5111631](https://github.com/mankatcheung/trakwyn/commit/5111631256c4e631990e4160538182aaa7072778))
* **web:** retry a request once after its UNAUTHORIZED triggered a successful refresh ([#948](https://github.com/mankatcheung/trakwyn/issues/948)) ([1facccb](https://github.com/mankatcheung/trakwyn/commit/1facccb55d5ad8c5b502b1aaf917519e47204599))
