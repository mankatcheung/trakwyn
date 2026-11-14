# Changelog

## [0.17.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.16.0...api-v0.17.0) (2026-11-14)


### Features

* **api:** add a claudecode eval provider that runs the judge and single-call cases through the Claude Code CLI (JEF-563) ([#1372](https://github.com/mankatcheung/trakwyn/issues/1372)) ([88014d5](https://github.com/mankatcheung/trakwyn/commit/88014d517dc17fb76b4177dc6504605bf825ca94))
* **api:** add a PostHog server client behind an IAiAnalytics port (JEF-566) ([#1380](https://github.com/mankatcheung/trakwyn/issues/1380)) ([3802658](https://github.com/mankatcheung/trakwyn/commit/3802658762e6379462bbd945bf202784aef41652))
* **api:** give each eval case an outcome and score only the cases that ran (JEF-559) ([#1362](https://github.com/mankatcheung/trakwyn/issues/1362)) ([ed3685c](https://github.com/mankatcheung/trakwyn/commit/ed3685c1e0934fa4426aba753eda23bf3e40ac75))
* **api:** group chat turns into PostHog AI sessions and send tool calls as $ai_span (JEF-568) ([#1382](https://github.com/mankatcheung/trakwyn/issues/1382)) ([afa2091](https://github.com/mankatcheung/trakwyn/commit/afa2091718f8d7a4a98cd5719f3c7e40c13a9beb))
* **api:** print a saved eval run's transcripts as readable text with eval --show ([#1368](https://github.com/mankatcheung/trakwyn/issues/1368)) ([410ae65](https://github.com/mankatcheung/trakwyn/commit/410ae652886d222675733b7d174d66ebef782874))
* **api:** publish a saved eval run to Langfuse without calling any model (JEF-562) ([#1366](https://github.com/mankatcheung/trakwyn/issues/1366)) ([d1b9560](https://github.com/mankatcheung/trakwyn/commit/d1b9560caeec6bcdf203253f2ea12ea5db00dae9))
* **api:** refuse a cover letter that names an employer, school, credential or number the user never gave (JEF-558) ([#1357](https://github.com/mankatcheung/trakwyn/issues/1357)) ([acc9402](https://github.com/mankatcheung/trakwyn/commit/acc9402ecf0318a183a5dcc1f8e6d45894cd5b3d))
* **api:** save each eval run to its own folder with a summary and compressed transcripts (JEF-560) ([#1363](https://github.com/mankatcheung/trakwyn/issues/1363)) ([7a912cd](https://github.com/mankatcheung/trakwyn/commit/7a912cdcb5281aa21333d78a079359214c30e48e))
* **api:** send a $ai_generation event to PostHog for every tracked LLM call (JEF-567) ([#1381](https://github.com/mankatcheung/trakwyn/issues/1381)) ([cf5fdf7](https://github.com/mankatcheung/trakwyn/commit/cf5fdf7792e28120f2e34e4c8c9392e09a1dab70))
* **api:** send AI output ratings to PostHog on the generation's trace (JEF-569) ([#1383](https://github.com/mankatcheung/trakwyn/issues/1383)) ([2ef215d](https://github.com/mankatcheung/trakwyn/commit/2ef215d52cacbf165d7669d4a92cd461f306edda))
* **api:** send each eval case's outcome to Langfuse so provider errors are not counted as failures (JEF-561) ([#1365](https://github.com/mankatcheung/trakwyn/issues/1365)) ([06e6ed1](https://github.com/mankatcheung/trakwyn/commit/06e6ed13a15a70f9d7c73d5f8ed3be7f431a6537))
* draft history with restore and a snapshot before the AI replaces the document (JEF-584) ([#1415](https://github.com/mankatcheung/trakwyn/issues/1415)) ([48d94b5](https://github.com/mankatcheung/trakwyn/commit/48d94b553fa702b7c7942bcab68676fc7ea12a38))
* **posthog:** add an AI features dashboard and two alerts (JEF-570) ([#1398](https://github.com/mankatcheung/trakwyn/issues/1398)) ([f05cf07](https://github.com/mankatcheung/trakwyn/commit/f05cf07f36a7808099736741e53235886ef5d72b))
* tables and text highlight in the document editor and the PDF export (JEF-582) ([#1419](https://github.com/mankatcheung/trakwyn/issues/1419)) ([f7a0dd5](https://github.com/mankatcheung/trakwyn/commit/f7a0dd50d3faeb88b0f43fd1065739900523eefd))
* text alignment (left, center, right) in the editor and the PDF export (JEF-578) ([#1414](https://github.com/mankatcheung/trakwyn/issues/1414)) ([2505dd5](https://github.com/mankatcheung/trakwyn/commit/2505dd5387dc2de69fcbb2e80d6d076cecb7ec03))
* **web:** draw the document editor on a page that matches the PDF (JEF-581) ([#1418](https://github.com/mankatcheung/trakwyn/issues/1418)) ([3f7c437](https://github.com/mankatcheung/trakwyn/commit/3f7c437c4cdffa1cbc5952414794fdaf7c2ad997))


### Bug Fixes

* **api:** number ordered lists in PDF export and keep text of unknown nodes (JEF-572) ([#1404](https://github.com/mankatcheung/trakwyn/issues/1404)) ([29bfa5d](https://github.com/mankatcheung/trakwyn/commit/29bfa5df564080264a51ae23296c13897a7a8201))
* **api:** pass the saved run's max error rate when publishing it (JEF-562) ([#1367](https://github.com/mankatcheung/trakwyn/issues/1367)) ([da2d49c](https://github.com/mankatcheung/trakwyn/commit/da2d49cea305142cdec7f0d2dfa688a65ac06b49))

## [0.16.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.15.0...api-v0.16.0) (2026-11-12)


### Features

* **api:** publish eval runs to Langfuse with --publish (JEF-550) ([#1347](https://github.com/mankatcheung/trakwyn/issues/1347)) ([f02e829](https://github.com/mankatcheung/trakwyn/commit/f02e829a948cdd584d707539e445dbabb068cd6e))
* **api:** stop an eval run on the first daily-quota error (JEF-556) ([#1353](https://github.com/mankatcheung/trakwyn/issues/1353)) ([781a63d](https://github.com/mankatcheung/trakwyn/commit/781a63d33de51c1b2e4c2af07c04bdf78a59b059))
* **infra:** Axiom dashboard for AI output feedback (JEF-551) ([#1340](https://github.com/mankatcheung/trakwyn/issues/1340)) ([867cdcc](https://github.com/mankatcheung/trakwyn/commit/867cdcc9b15bd2fadbb3ec56bf8dae30c202759d))
* pin the privacy policy's AI data-handling claims to code and link each provider's data use (JEF-549) ([#1337](https://github.com/mankatcheung/trakwyn/issues/1337)) ([f40ff2a](https://github.com/mankatcheung/trakwyn/commit/f40ff2a37180b83dc557dfa436b390f8aba6f1ee))
* tell the company briefing to include dated news from its search results (JEF-544) ([#1328](https://github.com/mankatcheung/trakwyn/issues/1328)) ([96b6ea8](https://github.com/mankatcheung/trakwyn/commit/96b6ea8fc93de4bc879d3b6aa5b5f0826dc19abb))
* thumbs up/down on AI output (JEF-547) ([#1334](https://github.com/mankatcheung/trakwyn/issues/1334)) ([e248ab2](https://github.com/mankatcheung/trakwyn/commit/e248ab2bfa452f5e01631214429cddf1cdc7faf6))


### Bug Fixes

* **api:** accept a full date in the briefing-cites-dated-news eval check (JEF-555) ([#1351](https://github.com/mankatcheung/trakwyn/issues/1351)) ([cce57ef](https://github.com/mankatcheung/trakwyn/commit/cce57ef506344d0aaebd54e123a82a34ead85387))
* **api:** fail over when gpt-oss answers with its reasoning text and no markers (JEF-554) ([#1350](https://github.com/mankatcheung/trakwyn/issues/1350)) ([662bc2c](https://github.com/mankatcheung/trakwyn/commit/662bc2c1ad68da117856e953b3dc39e1c782016f))
* **api:** keep Pro resumes and cover letters on the lite model (JEF-557) ([#1354](https://github.com/mankatcheung/trakwyn/issues/1354)) ([836c0b7](https://github.com/mankatcheung/trakwyn/commit/836c0b704394bd08fc12a5ee89ec43037589755d))
* **api:** normalise Unicode spaces and dashes in the eval text matchers (JEF-546) ([#1330](https://github.com/mankatcheung/trakwyn/issues/1330)) ([b72a09c](https://github.com/mankatcheung/trakwyn/commit/b72a09cfec3f45e44ee8614c55ce595df5db2934))
* **api:** stop resume match and cover letter obeying instructions in a posting (JEF-552) ([#1349](https://github.com/mankatcheung/trakwyn/issues/1349)) ([8d9554f](https://github.com/mankatcheung/trakwyn/commit/8d9554f8ee9bf0e9bbbf80b7b9a0c52cd4fe9aa2))
* **api:** write profile dates in AI prompts as UTC month and year (JEF-553) ([#1348](https://github.com/mankatcheung/trakwyn/issues/1348)) ([b6cb6c5](https://github.com/mankatcheung/trakwyn/commit/b6cb6c51a19e5905ef9b97e9837ccb125652ca83))
* fail over when gpt-oss leaks its tool call into the message text (JEF-541) ([#1321](https://github.com/mankatcheung/trakwyn/issues/1321)) ([9410ab5](https://github.com/mankatcheung/trakwyn/commit/9410ab556627e2119a91541a22532ddbe863e394))

## [0.15.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.14.0...api-v0.15.0) (2026-11-09)


### Features

* add a workersai eval target that builds the provider the way hosted AI does (JEF-540) ([#1318](https://github.com/mankatcheung/trakwyn/issues/1318)) ([d1476d6](https://github.com/mankatcheung/trakwyn/commit/d1476d654063445052f9b15c0ac629d45ecc9759))
* **api:** eval runner saves its report, shows provider errors and cache counts (JEF-542) ([#1316](https://github.com/mankatcheung/trakwyn/issues/1316)) ([83bb3bd](https://github.com/mankatcheung/trakwyn/commit/83bb3bdb00c180c247d3e25d83c4c71588271a85))


### Bug Fixes

* send an empty string, not null, as replayed tool-call content (JEF-539) ([#1315](https://github.com/mankatcheung/trakwyn/issues/1315)) ([c81298f](https://github.com/mankatcheung/trakwyn/commit/c81298fa1a98a979a5436a79f3d2a0268a5a093a))

## [0.14.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.13.0...api-v0.14.0) (2026-11-09)


### Features

* add Tavily web search to company briefings for Pro users (JEF-538) ([#1310](https://github.com/mankatcheung/trakwyn/issues/1310)) ([98112ae](https://github.com/mankatcheung/trakwyn/commit/98112ae1aaffd8be3b129d63fb9b8a4035f6a027))
* ground company briefings in the company's own site and show sources (JEF-475) ([#1308](https://github.com/mankatcheung/trakwyn/issues/1308)) ([a6b2352](https://github.com/mankatcheung/trakwyn/commit/a6b235284a03ed978e82a6d81a7820a241cff276))
* **web:** run each guide as a Playwright script that checks its steps and takes its screenshots (JEF-532) ([#1306](https://github.com/mankatcheung/trakwyn/issues/1306)) ([3c85963](https://github.com/mankatcheung/trakwyn/commit/3c859630e2bacc09e3e96e433f1820b8f218ec93))


### Performance Improvements

* **api:** cache CORS preflights for two hours (JEF-536) ([#1303](https://github.com/mankatcheung/trakwyn/issues/1303)) ([cd0e58d](https://github.com/mankatcheung/trakwyn/commit/cd0e58dc914e36ca447be5c4d0b4d87007164d03))
* **api:** replace bcryptjs with native @node-rs/bcrypt (JEF-534) ([#1299](https://github.com/mankatcheung/trakwyn/issues/1299)) ([45571fa](https://github.com/mankatcheung/trakwyn/commit/45571fa51948eae6d8266b3abd31fb89f7e3fe85))

## [0.13.0](https://github.com/mankatcheung/trakwyn/compare/api-v0.12.0...api-v0.13.0) (2026-11-08)


### Features

* add an AI helper with user prompts to the resume and cover letter editor (JEF-506) ([#1233](https://github.com/mankatcheung/trakwyn/issues/1233)) ([ae6ec42](https://github.com/mankatcheung/trakwyn/commit/ae6ec428607a9317d9a26e79ac1b702e649ca4ff))
* add user prompts and AI credit meters to mock interview and company briefing (JEF-507) ([#1239](https://github.com/mankatcheung/trakwyn/issues/1239)) ([1d8b43e](https://github.com/mankatcheung/trakwyn/commit/1d8b43edc39ee1eaa5f4ec282ba787bc74ea6a80))
* **api:** add a health circuit per hosted AI model so outages fail fast (JEF-504) ([#1229](https://github.com/mankatcheung/trakwyn/issues/1229)) ([d011d13](https://github.com/mankatcheung/trakwyn/commit/d011d13de4941ff2f4b282263fab1ccd685e7a5b))
* **api:** add a name and email contact header to generated resumes (JEF-526) ([#1281](https://github.com/mankatcheung/trakwyn/issues/1281)) ([6ed06c2](https://github.com/mankatcheung/trakwyn/commit/6ed06c2836e67421e582d04589ea708c02d01e47))
* **api:** eval chat assistant tool selection (JEF-471) ([#1265](https://github.com/mankatcheung/trakwyn/issues/1265)) ([4283025](https://github.com/mankatcheung/trakwyn/commit/4283025cd7a6fd720a604e89a84d8a4d15afee96))
* **api:** eval resumes and cover letters for invented content (JEF-470) ([#1251](https://github.com/mankatcheung/trakwyn/issues/1251)) ([eeef608](https://github.com/mankatcheung/trakwyn/commit/eeef608fcde30b9f07fe79d38edd7c1f155b5689))
* **api:** record neurons, reasoning output and gateway metadata for hosted AI (JEF-497) ([#1225](https://github.com/mankatcheung/trakwyn/issues/1225)) ([c7c2aa1](https://github.com/mankatcheung/trakwyn/commit/c7c2aa1403f81c8e6baaf74224143378708f5ffe))
* **api:** version every AI prompt and record the version on each LLM call (JEF-505) ([#1230](https://github.com/mankatcheung/trakwyn/issues/1230)) ([9021d95](https://github.com/mankatcheung/trakwyn/commit/9021d9552c9932800d1ad78ebb8ed461f1e03ae2))
* store phone, location and profile links and add them to generated resumes (JEF-527) ([#1285](https://github.com/mankatcheung/trakwyn/issues/1285)) ([b1ee75c](https://github.com/mankatcheung/trakwyn/commit/b1ee75c29ef0f8d0cdea28731e4a973462cf3519))
* **web:** replace the hero and feature-page mockups with real screenshots (JEF-530) ([#1292](https://github.com/mankatcheung/trakwyn/issues/1292)) ([7711f8e](https://github.com/mankatcheung/trakwyn/commit/7711f8e74b079b09ed0740bfc29338bff2e68917))
* **web:** track the marketing → signup → Pro funnel with named PostHog events (JEF-514) ([#1266](https://github.com/mankatcheung/trakwyn/issues/1266)) ([6b6be60](https://github.com/mankatcheung/trakwyn/commit/6b6be60e7b4cf4fc500e975a37ef7613a4144309))

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
