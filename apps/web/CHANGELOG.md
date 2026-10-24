# Changelog

## [0.6.0](https://github.com/mankatcheung/trakwyn/compare/web-v0.5.0...web-v0.6.0) (2026-10-24)


### Features

* take payment for Pro behind a provider-neutral billing port (JEF-426) ([#1049](https://github.com/mankatcheung/trakwyn/issues/1049)) ([7a45437](https://github.com/mankatcheung/trakwyn/commit/7a45437b840df8e4036187529a92796ce04495e8))

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
