# Changelog

## [0.12.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.11.2...api-v0.12.0) (2026-11-05)


### Features

* **api,web,mobile:** choose which AI answers with one ordered provider list (JEF-503) ([#1224](https://github.com/mankatcheung/trakwyn/issues/1224)) ([d314bfa](https://github.com/mankatcheung/trakwyn/commit/d314bfae563ee21024ba881fa99834d858b97eb7))
* **api:** add a platform-owned LLM provider behind Cloudflare AI Gateway (JEF-446) ([#1205](https://github.com/mankatcheung/trakwyn/issues/1205)) ([0850477](https://github.com/mankatcheung/trakwyn/commit/08504770364408f875b69e21d3e80811d8b3d6c2))
* **api:** add monthly hosted AI credits to Free and Pro plans (JEF-447) ([#1206](https://github.com/mankatcheung/trakwyn/issues/1206)) ([63a843c](https://github.com/mankatcheung/trakwyn/commit/63a843cf277f2ef3c8c4728d539db37f636026d7))
* **api:** cap rows and text length on creation paths that had none (JEF-339) ([#1195](https://github.com/mankatcheung/trakwyn/issues/1195)) ([63cb829](https://github.com/mankatcheung/trakwyn/commit/63cb82917933514976e3e1315e1b5989cdb1a6bf))
* **api:** guard hosted AI spend with verification, rate limits and a daily budget breaker (JEF-449) ([#1208](https://github.com/mankatcheung/trakwyn/issues/1208)) ([73b72bd](https://github.com/mankatcheung/trakwyn/commit/73b72bda76b928267829dc50b2907a4bb7180585))
* **api:** record cost, feature and source on every LLM call (JEF-444) ([#1203](https://github.com/mankatcheung/trakwyn/issues/1203)) ([bb5a55e](https://github.com/mankatcheung/trakwyn/commit/bb5a55e9c1d5e42136e18f17ff973a07254ccc5b))
* **api:** route hosted AI calls to a model tier by plan and feature, with a Pro cost ceiling (JEF-448) ([#1207](https://github.com/mankatcheung/trakwyn/issues/1207)) ([883559b](https://github.com/mankatcheung/trakwyn/commit/883559b7e4ef06ba54627ea16dbd057a68499048))
* **api:** skip the model for JSON-LD postings, share parsed URL postings, reuse unchanged match scores (JEF-450) ([#1204](https://github.com/mankatcheung/trakwyn/issues/1204)) ([8398b30](https://github.com/mankatcheung/trakwyn/commit/8398b305e670cc775dba71006bbc298a0f958bde))
* **api:** staged rollout and Cloudflare-only hosted AI (JEF-453) ([#1213](https://github.com/mankatcheung/trakwyn/issues/1213)) ([6115ecd](https://github.com/mankatcheung/trakwyn/commit/6115ecda261fa492ddcb36e7966a740544192b55))
* **api:** turn off thinking and reasoning tokens per feature in the LLM adapters (JEF-445) ([#1201](https://github.com/mankatcheung/trakwyn/issues/1201)) ([446085e](https://github.com/mankatcheung/trakwyn/commit/446085e37015eeb64ae0026a3414670c8cc81048))
* show remaining quota at create affordances on web and mobile (JEF-494) ([#1199](https://github.com/mankatcheung/trakwyn/issues/1199)) ([a05e9c9](https://github.com/mankatcheung/trakwyn/commit/a05e9c9f5dee845083e3bdefc9346b521b524c8b))
* show Trakwyn AI, credits and upgrade prompts in web, mobile and the Clipper (JEF-451) ([#1209](https://github.com/mankatcheung/trakwyn/issues/1209)) ([047196b](https://github.com/mankatcheung/trakwyn/commit/047196b53b91803204cf472b25a765a8147db859))

## [0.11.2](https://github.com/mankatcheung/trakwyn/compare/api-v0.11.1...api-v0.11.2) (2026-11-02)


### Bug Fixes

* **ci:** run the base-image mirror in the production environment ([#1196](https://github.com/mankatcheung/trakwyn/issues/1196)) ([4d19f62](https://github.com/mankatcheung/trakwyn/commit/4d19f623cfdf859a136598b4486bac09beec6bbe))

## [0.11.1](https://github.com/mankatcheung/trakwyn/compare/api-v0.11.0...api-v0.11.1) (2026-11-01)


### Bug Fixes

* resolve ExtractDocumentTextUseCase through the container (JEF-492) ([#1189](https://github.com/mankatcheung/trakwyn/issues/1189)) ([0f98536](https://github.com/mankatcheung/trakwyn/commit/0f98536fa25f1fdeecbdddaf4878824c20d36b37))

## [0.11.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.10.0...api-v0.11.0) (2026-11-01)


### Features

* rate-limit the OAuth redirects and the document file route by IP (JEF-483) ([#1170](https://github.com/mankatcheung/trakwyn/issues/1170)) ([615e004](https://github.com/mankatcheung/trakwyn/commit/615e004431f8782effe430c126551bc7f5e057a3))
* tailor practice questions and talking points to the user's profile and resume (JEF-394) ([#1161](https://github.com/mankatcheung/trakwyn/issues/1161)) ([3d6f0aa](https://github.com/mankatcheung/trakwyn/commit/3d6f0aaff0fb4c2f7d3d2c37c23011be45fd2282))


### Bug Fixes

* harden HTML-to-text in the job posting resolver and the Clipper (JEF-482) ([#1169](https://github.com/mankatcheung/trakwyn/issues/1169)) ([6acf8e3](https://github.com/mankatcheung/trakwyn/commit/6acf8e34e342a6788b2141e1d5f8c5379cc835bb))


### Performance Improvements

* shrink the API image from 1.11 GB to 611 MB ([#1173](https://github.com/mankatcheung/trakwyn/issues/1173)) ([6131133](https://github.com/mankatcheung/trakwyn/commit/61311339a61b6526eaed5779c0d4c5c988e04ff7))

## [0.10.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.9.0...api-v0.10.0) (2026-10-29)


### Features

* **extension:** send the Clipper's version in a request header (JEF-473) ([#1143](https://github.com/mankatcheung/trakwyn/issues/1143)) ([bb8279d](https://github.com/mankatcheung/trakwyn/commit/bb8279dce1cc1958cef4627a82caaa439e76228d))

## [0.9.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.8.0...api-v0.9.0) (2026-10-29)


### Features

* add a first-run welcome flow and an empty-profile prompt (JEF-460) ([#1123](https://github.com/mankatcheung/trakwyn/issues/1123)) ([fb6fe9e](https://github.com/mankatcheung/trakwyn/commit/fb6fe9e90be8eb5aec4a682bae15faef357373eb))
* **api:** add an on-demand eval runner for job parsing and resume match (JEF-114) ([#1114](https://github.com/mankatcheung/trakwyn/issues/1114)) ([a21ddaf](https://github.com/mankatcheung/trakwyn/commit/a21ddaf3c06dc060779c508f909bd2fab8fc738c))
* **api:** fill MCP write-tool gaps and add tool annotations (JEF-468) ([#1125](https://github.com/mankatcheung/trakwyn/issues/1125)) ([4f48b4a](https://github.com/mankatcheung/trakwyn/commit/4f48b4a0d8cef4f0d7b04ade937c5ea3d986d938))
* attribute MCP write-tool changes to the calling token (JEF-466) ([#1129](https://github.com/mankatcheung/trakwyn/issues/1129)) ([33e1483](https://github.com/mankatcheung/trakwyn/commit/33e14836e1416e3088105635c49c216adf1ddf84))
* harden account deletion with step-up for every sign-in method, email confirmation and a 14-day grace period (JEF-463) ([#1133](https://github.com/mankatcheung/trakwyn/issues/1133)) ([16e6594](https://github.com/mankatcheung/trakwyn/commit/16e6594e3ce49bfcfad44c0ee2a98ef186f75b01))
* let the chat assistant propose writes the user confirms (JEF-469) ([#1132](https://github.com/mankatcheung/trakwyn/issues/1132)) ([253c0bc](https://github.com/mankatcheung/trakwyn/commit/253c0bcd6521cfb522b58af9c71b94e5855d0099))
* rate-limit MCP tools/call per token, reads and writes apart (JEF-465) ([#1128](https://github.com/mankatcheung/trakwyn/issues/1128)) ([53e9857](https://github.com/mankatcheung/trakwyn/commit/53e9857cbab9049437a4962693fd26bbec2b14cc))


### Bug Fixes

* **api:** answer and log invalid GraphQL documents as client errors (JEF-472) ([#1135](https://github.com/mankatcheung/trakwyn/issues/1135)) ([4df4c72](https://github.com/mankatcheung/trakwyn/commit/4df4c723899429921297c7b5084e428b972f3e16))
* **api:** read LLM usage lastUsedAt as a Date, not a number ([#1116](https://github.com/mankatcheung/trakwyn/issues/1116)) ([9661301](https://github.com/mankatcheung/trakwyn/commit/96613014f4d882a2ce0e57d81f6ebb84c6f90f39))

## [0.8.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.7.0...api-v0.8.0) (2026-10-28)


### Features

* import the profile from an uploaded CV (JEF-461) ([#1113](https://github.com/mankatcheung/trakwyn/issues/1113)) ([6167a56](https://github.com/mankatcheung/trakwyn/commit/6167a5615fa5c6896559708e979b8794a07fe71a))

## [0.7.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.6.0...api-v0.7.0) (2026-10-28)


### Miscellaneous Chores

* **api:** Synchronize server versions

## [0.6.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.5.0...api-v0.6.0) (2026-10-27)


### Features

* add the Polar billing adapter and setup scripts (JEF-432) ([#1061](https://github.com/mankatcheung/trakwyn/issues/1061)) ([d2ac387](https://github.com/mankatcheung/trakwyn/commit/d2ac387a64fafb33e1611e01d80a248f21342f1b))
* **extension:** build the Clipper for Firefox and prepare its AMO listing (JEF-423) ([#1030](https://github.com/mankatcheung/trakwyn/issues/1030)) ([44d70dd](https://github.com/mankatcheung/trakwyn/commit/44d70dda70431861c9256fabc5709c20db5acd7a))
* make bring-your-own-key AI actions and MCP available on Free (JEF-442) ([#1073](https://github.com/mankatcheung/trakwyn/issues/1073)) ([2a3aec5](https://github.com/mankatcheung/trakwyn/commit/2a3aec5de5f14384d5e4e28031a05ce37077f68d))
* revoke the Polar subscription when a user deletes their account (JEF-439) ([#1067](https://github.com/mankatcheung/trakwyn/issues/1067)) ([4074f19](https://github.com/mankatcheung/trakwyn/commit/4074f191ba57d5a76a278ffd36d504846d95b6a4))
* take payment for Pro behind a provider-neutral billing port (JEF-426) ([#1049](https://github.com/mankatcheung/trakwyn/issues/1049)) ([7a45437](https://github.com/mankatcheung/trakwyn/commit/7a45437b840df8e4036187529a92796ce04495e8))


### Bug Fixes

* block unverified email accounts behind a verification wall (JEF-438) ([#1063](https://github.com/mankatcheung/trakwyn/issues/1063)) ([8b0ee3e](https://github.com/mankatcheung/trakwyn/commit/8b0ee3e057e733a380acb00e0187cca00fabf820))
* **deps:** clear all open Dependabot alerts via overrides and a lockfile bump ([#1088](https://github.com/mankatcheung/trakwyn/issues/1088)) ([59cd6d4](https://github.com/mankatcheung/trakwyn/commit/59cd6d45b4f4a4f979acc97cb075ca6d8def6873))

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
