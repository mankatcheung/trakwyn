# Changelog

## [0.6.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.5.0...api-v0.6.0) (2026-10-24)


### Features

* add the Polar billing adapter and setup scripts (JEF-432) ([#1061](https://github.com/mankatcheung/trakwyn/issues/1061)) ([d2ac387](https://github.com/mankatcheung/trakwyn/commit/d2ac387a64fafb33e1611e01d80a248f21342f1b))
* take payment for Pro behind a provider-neutral billing port (JEF-426) ([#1049](https://github.com/mankatcheung/trakwyn/issues/1049)) ([7a45437](https://github.com/mankatcheung/trakwyn/commit/7a45437b840df8e4036187529a92796ce04495e8))

## [0.5.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.4.0...api-v0.5.0) (2026-10-23)


### Features

* add Free and Pro plans, entitlements and tier enforcement (JEF-344) ([#1038](https://github.com/mankatcheung/trakwyn/issues/1038)) ([9efb7ec](https://github.com/mankatcheung/trakwyn/commit/9efb7eccc64bf2f5eabd6bed629a812fbc9761be))
* cap total document storage per user and show usage (JEF-425) ([#1034](https://github.com/mankatcheung/trakwyn/issues/1034)) ([d6e8d77](https://github.com/mankatcheung/trakwyn/commit/d6e8d77f30d678f2920a1df1be1b5756beb1956c))


### Bug Fixes

* wrap multi-write use cases in a transaction (JEF-427) ([#1041](https://github.com/mankatcheung/trakwyn/issues/1041)) ([d5ba6e5](https://github.com/mankatcheung/trakwyn/commit/d5ba6e591fd04a158363dc0eee5710bc8744a208))

## [0.4.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.3.0...api-v0.4.0) (2026-10-23)


### Features

* **extension:** upload the Clipper to the Chrome Web Store from the release workflow (JEF-419) ([#1026](https://github.com/mankatcheung/trakwyn/issues/1026)) ([65c61ba](https://github.com/mankatcheung/trakwyn/commit/65c61baa2f668f3fcef5be3e5be9c36be9ec180a))

## [0.3.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.2.1...api-v0.3.0) (2026-10-22)


### Features

* **extension:** keep me signed in across browser restarts (JEF-421) ([#1012](https://github.com/mankatcheung/trakwyn/issues/1012)) ([423dc78](https://github.com/mankatcheung/trakwyn/commit/423dc78bb994b9145e843aa399ae5e063ab8b5e1))


### Bug Fixes

* **api:** cap session lifetime at 90 days from creation (JEF-422) ([#1010](https://github.com/mankatcheung/trakwyn/issues/1010)) ([248b34d](https://github.com/mankatcheung/trakwyn/commit/248b34d59fc4c0ef1eca759113efba8065bbd115))

## [0.2.1](https://github.com/mankatcheung/trakwyn/compare/api-v0.2.0...api-v0.2.1) (2026-10-20)


### Miscellaneous Chores

* **api:** Synchronize server versions

## [0.2.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.1.0...api-v0.2.0) (2026-10-16)


### Features

* ATS-readiness score for uploaded and created resumes, saved per resume (JEF-395) ([#959](https://github.com/mankatcheung/trakwyn/issues/959)) ([5adf194](https://github.com/mankatcheung/trakwyn/commit/5adf1940c010e0e4d9570631f2f47f0161b7e7de))
* captcha and rate limits on register, login and password reset (JEF-401) ([#964](https://github.com/mankatcheung/trakwyn/issues/964)) ([88448fa](https://github.com/mankatcheung/trakwyn/commit/88448faa8b87d4cf89b8522942162f70c572be20))
* **extension:** Google and GitHub login in the Trakwyn Clipper (JEF-383) ([#921](https://github.com/mankatcheung/trakwyn/issues/921)) ([ca48bee](https://github.com/mankatcheung/trakwyn/commit/ca48bee0ed1652d03b4228f505f01cf8ad22b95d))
* **extension:** support Safari by building the Clipper with WXT (JEF-386) ([#924](https://github.com/mankatcheung/trakwyn/issues/924)) ([0f0a764](https://github.com/mankatcheung/trakwyn/commit/0f0a7647d846d0ba86769ead8592700aac7422dd))
* practice interview questions and AI answers (JEF-393) ([#944](https://github.com/mankatcheung/trakwyn/issues/944)) ([dfdd213](https://github.com/mankatcheung/trakwyn/commit/dfdd2135b7df37b1e3e2bbefd5f9b459ce9ad314))
* record questions and responses per interview round (JEF-392) ([#940](https://github.com/mankatcheung/trakwyn/issues/940)) ([074c688](https://github.com/mankatcheung/trakwyn/commit/074c68865b23c82ad47d355564594b4417265f45))
* render the company briefing as markdown on web and mobile (JEF-391) ([#937](https://github.com/mankatcheung/trakwyn/issues/937)) ([5dc1bf1](https://github.com/mankatcheung/trakwyn/commit/5dc1bf1e1b0cfd26bb1e51dd2af419bd7618d329))
* save resume match per resume and move it into the Resumes tab (JEF-397) ([#952](https://github.com/mankatcheung/trakwyn/issues/952)) ([b4bcc63](https://github.com/mankatcheung/trakwyn/commit/b4bcc63c7883982664b1d206560027262ca61434))
* section counts on mobile and a generated marker for Company Briefing (JEF-398) ([#953](https://github.com/mankatcheung/trakwyn/issues/953)) ([1295273](https://github.com/mankatcheung/trakwyn/commit/129527350283e67890c8174328f5586dc609bab0))
* serve documents through an authenticated route instead of a storage URL (JEF-51) ([#956](https://github.com/mankatcheung/trakwyn/issues/956)) ([ee86faf](https://github.com/mankatcheung/trakwyn/commit/ee86faf76bd2c0c172434e9c2945e2ccbe5d26df))
* split documents into cover letters, resumes and other documents (JEF-396) ([#949](https://github.com/mankatcheung/trakwyn/issues/949)) ([cb4a6fc](https://github.com/mankatcheung/trakwyn/commit/cb4a6fcb1bf7c647babee5b734aff8e85d2fa87c))
* store documents in a private Blob store (JEF-51) ([#957](https://github.com/mankatcheung/trakwyn/issues/957)) ([085ac9d](https://github.com/mankatcheung/trakwyn/commit/085ac9df6bcd9e7ef0c3c025043ce1a1c9afda4b))


### Bug Fixes

* **ci:** pull node and postgres from the AWS public mirror, not Docker Hub ([#941](https://github.com/mankatcheung/trakwyn/issues/941)) ([0f684a5](https://github.com/mankatcheung/trakwyn/commit/0f684a51989a059338c00097b05961c43dfb1e75))
* retry mirror copies that hit a registry rate limit (JEF-406) ([#979](https://github.com/mankatcheung/trakwyn/issues/979)) ([80738c2](https://github.com/mankatcheung/trakwyn/commit/80738c2e0ec9cf57f5f4f02f05a788ac1aa316d6))
* throttle verification emails so sign-up abuse can't drain the Brevo quota (JEF-400) ([#961](https://github.com/mankatcheung/trakwyn/issues/961)) ([8fe0b8b](https://github.com/mankatcheung/trakwyn/commit/8fe0b8ba96fec7dd8423c64c2508a8e6784777dd))
