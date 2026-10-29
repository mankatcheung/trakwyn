# Changelog

## [1.4.0](https://github.com/mankatcheung/trakwyn/compare/clipper-v1.3.1...clipper-v1.4.0) (2026-10-29)


### Features

* **extension:** send the Clipper's version in a request header (JEF-473) ([#1143](https://github.com/mankatcheung/trakwyn/issues/1143)) ([bb8279d](https://github.com/mankatcheung/trakwyn/commit/bb8279dce1cc1958cef4627a82caaa439e76228d))

## [1.3.1](https://github.com/mankatcheung/trakwyn/compare/clipper-v1.3.0...clipper-v1.3.1) (2026-10-28)


### Performance Improvements

* **extension:** show the Clipper popup's clip before the API answers (JEF-457) ([#1103](https://github.com/mankatcheung/trakwyn/issues/1103)) ([6870a71](https://github.com/mankatcheung/trakwyn/commit/6870a71865d0aad950980d85f9e0cb9b626b9f8b))

## [1.3.0](https://github.com/mankatcheung/trakwyn/compare/clipper-v1.2.1...clipper-v1.3.0) (2026-10-27)


### Features

* **extension:** apply a downloaded update as soon as the Clipper is idle (JEF-455) ([#1095](https://github.com/mankatcheung/trakwyn/issues/1095)) ([5c82e41](https://github.com/mankatcheung/trakwyn/commit/5c82e41e6bf488df00288e1c58dd66102f5d0c6d))

## [1.2.1](https://github.com/mankatcheung/trakwyn/compare/clipper-v1.2.0...clipper-v1.2.1) (2026-10-27)


### Bug Fixes

* **deps:** clear all open Dependabot alerts via overrides and a lockfile bump ([#1088](https://github.com/mankatcheung/trakwyn/issues/1088)) ([59cd6d4](https://github.com/mankatcheung/trakwyn/commit/59cd6d45b4f4a4f979acc97cb075ca6d8def6873))

## [1.2.0](https://github.com/mankatcheung/trakwyn/compare/clipper-v1.1.1...clipper-v1.2.0) (2026-10-27)


### Features

* **extension:** build the Clipper for Firefox and prepare its AMO listing (JEF-423) ([#1030](https://github.com/mankatcheung/trakwyn/issues/1030)) ([44d70dd](https://github.com/mankatcheung/trakwyn/commit/44d70dda70431861c9256fabc5709c20db5acd7a))

## [1.1.1](https://github.com/mankatcheung/trakwyn/compare/clipper-v1.1.0...clipper-v1.1.1) (2026-10-23)


### Bug Fixes

* **extension:** open saved applications on the web app, not the API host (JEF-428) ([#1043](https://github.com/mankatcheung/trakwyn/issues/1043)) ([4e76f2f](https://github.com/mankatcheung/trakwyn/commit/4e76f2f70ee80d610eb55f7e1db9ff5c2b6c2682))

## [1.1.0](https://github.com/mankatcheung/trakwyn/compare/clipper-v1.0.0...clipper-v1.1.0) (2026-10-22)


### Features

* **extension:** upload the Clipper to the Chrome Web Store from the release workflow (JEF-419) ([#1026](https://github.com/mankatcheung/trakwyn/issues/1026)) ([65c61ba](https://github.com/mankatcheung/trakwyn/commit/65c61baa2f668f3fcef5be3e5be9c36be9ec180a))

## [1.0.0](https://github.com/mankatcheung/trakwyn/compare/clipper-v0.2.0...clipper-v1.0.0) (2026-10-21)


### Features

* **extension:** choose AI or the built-in parser to read a posting (JEF-420) ([#1007](https://github.com/mankatcheung/trakwyn/issues/1007)) ([0aec845](https://github.com/mankatcheung/trakwyn/commit/0aec845eaa288ae3d043817b89907ac628410b8f))
* **extension:** keep me signed in across browser restarts (JEF-421) ([#1012](https://github.com/mankatcheung/trakwyn/issues/1012)) ([423dc78](https://github.com/mankatcheung/trakwyn/commit/423dc78bb994b9145e843aa399ae5e063ab8b5e1))
* **extension:** pin Chrome builds to the Web Store extension ID (JEF-415) ([#1014](https://github.com/mankatcheung/trakwyn/issues/1014)) ([93eb1ba](https://github.com/mankatcheung/trakwyn/commit/93eb1ba30b038c2d1b34a9b824afd0440bb97155))


### Bug Fixes

* **extension:** default to the production API and drop dev host permissions (JEF-412) ([#995](https://github.com/mankatcheung/trakwyn/issues/995)) ([2e68185](https://github.com/mankatcheung/trakwyn/commit/2e68185a99d2347d8cb5ecdcb442601edaad43fc))

## [0.2.0](https://github.com/mankatcheung/trakwyn/compare/clipper-v0.1.0...clipper-v0.2.0) (2026-10-16)


### Features

* **extension:** error reporting and trace correlation for the Trakwyn Clipper (JEF-387) ([#929](https://github.com/mankatcheung/trakwyn/issues/929)) ([f0d9050](https://github.com/mankatcheung/trakwyn/commit/f0d90509ce0901ca73aa622528653300371aba6d))
* **extension:** Google and GitHub login in the Trakwyn Clipper (JEF-383) ([#921](https://github.com/mankatcheung/trakwyn/issues/921)) ([ca48bee](https://github.com/mankatcheung/trakwyn/commit/ca48bee0ed1652d03b4228f505f01cf8ad22b95d))
* **extension:** show the signed-in user instead of the API URL (JEF-384) ([#920](https://github.com/mankatcheung/trakwyn/issues/920)) ([3ef70dc](https://github.com/mankatcheung/trakwyn/commit/3ef70dc27eb938819998acb906a401e503a8487c))
* **extension:** support Safari by building the Clipper with WXT (JEF-386) ([#924](https://github.com/mankatcheung/trakwyn/issues/924)) ([0f0a764](https://github.com/mankatcheung/trakwyn/commit/0f0a7647d846d0ba86769ead8592700aac7422dd))
