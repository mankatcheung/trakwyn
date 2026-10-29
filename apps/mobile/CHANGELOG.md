# Changelog

## [0.4.0](https://github.com/mankatcheung/trakwyn/compare/mobile-v0.3.1...mobile-v0.4.0) (2026-10-29)


### Features

* harden account deletion with step-up for every sign-in method, email confirmation and a 14-day grace period (JEF-463) ([#1133](https://github.com/mankatcheung/trakwyn/issues/1133)) ([16e6594](https://github.com/mankatcheung/trakwyn/commit/16e6594e3ce49bfcfad44c0ee2a98ef186f75b01))
* let the chat assistant propose writes the user confirms (JEF-469) ([#1132](https://github.com/mankatcheung/trakwyn/issues/1132)) ([253c0bc](https://github.com/mankatcheung/trakwyn/commit/253c0bcd6521cfb522b58af9c71b94e5855d0099))


### Bug Fixes

* never load images or unsafe URLs from AI-rendered markdown (JEF-464) ([#1126](https://github.com/mankatcheung/trakwyn/issues/1126)) ([a205447](https://github.com/mankatcheung/trakwyn/commit/a205447e0116793dd88355f650bf19ec465f1420))

## [0.3.1](https://github.com/mankatcheung/trakwyn/compare/mobile-v0.3.0...mobile-v0.3.1) (2026-10-27)


### Bug Fixes

* block unverified email accounts behind a verification wall (JEF-438) ([#1063](https://github.com/mankatcheung/trakwyn/issues/1063)) ([8b0ee3e](https://github.com/mankatcheung/trakwyn/commit/8b0ee3e057e733a380acb00e0187cca00fabf820))

## [0.3.0](https://github.com/mankatcheung/trakwyn/compare/mobile-v0.2.0...mobile-v0.3.0) (2026-10-23)


### Features

* add Free and Pro plans, entitlements and tier enforcement (JEF-344) ([#1038](https://github.com/mankatcheung/trakwyn/issues/1038)) ([9efb7ec](https://github.com/mankatcheung/trakwyn/commit/9efb7eccc64bf2f5eabd6bed629a812fbc9761be))
* cap total document storage per user and show usage (JEF-425) ([#1034](https://github.com/mankatcheung/trakwyn/issues/1034)) ([d6e8d77](https://github.com/mankatcheung/trakwyn/commit/d6e8d77f30d678f2920a1df1be1b5756beb1956c))

## [0.2.0](https://github.com/mankatcheung/trakwyn/compare/mobile-v0.1.0...mobile-v0.2.0) (2026-10-16)


### Features

* ATS-readiness score for uploaded and created resumes, saved per resume (JEF-395) ([#959](https://github.com/mankatcheung/trakwyn/issues/959)) ([5adf194](https://github.com/mankatcheung/trakwyn/commit/5adf1940c010e0e4d9570631f2f47f0161b7e7de))
* captcha and rate limits on register, login and password reset (JEF-401) ([#964](https://github.com/mankatcheung/trakwyn/issues/964)) ([88448fa](https://github.com/mankatcheung/trakwyn/commit/88448faa8b87d4cf89b8522942162f70c572be20))
* practice interview questions and AI answers (JEF-393) ([#944](https://github.com/mankatcheung/trakwyn/issues/944)) ([dfdd213](https://github.com/mankatcheung/trakwyn/commit/dfdd2135b7df37b1e3e2bbefd5f9b459ce9ad314))
* record questions and responses per interview round (JEF-392) ([#940](https://github.com/mankatcheung/trakwyn/issues/940)) ([074c688](https://github.com/mankatcheung/trakwyn/commit/074c68865b23c82ad47d355564594b4417265f45))
* render the company briefing as markdown on web and mobile (JEF-391) ([#937](https://github.com/mankatcheung/trakwyn/issues/937)) ([5dc1bf1](https://github.com/mankatcheung/trakwyn/commit/5dc1bf1e1b0cfd26bb1e51dd2af419bd7618d329))
* save resume match per resume and move it into the Resumes tab (JEF-397) ([#952](https://github.com/mankatcheung/trakwyn/issues/952)) ([b4bcc63](https://github.com/mankatcheung/trakwyn/commit/b4bcc63c7883982664b1d206560027262ca61434))
* section counts on mobile and a generated marker for Company Briefing (JEF-398) ([#953](https://github.com/mankatcheung/trakwyn/issues/953)) ([1295273](https://github.com/mankatcheung/trakwyn/commit/129527350283e67890c8174328f5586dc609bab0))
* show drafts and files in one list on the resume and cover letter tabs (JEF-399) ([#955](https://github.com/mankatcheung/trakwyn/issues/955)) ([872a81e](https://github.com/mankatcheung/trakwyn/commit/872a81ee02effb93804dc30b1fd639653e23744e))
* split documents into cover letters, resumes and other documents (JEF-396) ([#949](https://github.com/mankatcheung/trakwyn/issues/949)) ([cb4a6fc](https://github.com/mankatcheung/trakwyn/commit/cb4a6fcb1bf7c647babee5b734aff8e85d2fa87c))


### Bug Fixes

* **ci:** retry the Maestro app launch and gate deploys to pushes ([#934](https://github.com/mankatcheung/trakwyn/issues/934)) ([d625a76](https://github.com/mankatcheung/trakwyn/commit/d625a76316d64a82e36e2b471714c2abd13e7372))
