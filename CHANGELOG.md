# Changelog

## [3.0.0](https://github.com/meinestadt/glue-schema-registry/compare/v2.1.0...v3.0.0) (2025-08-29)


### ⚠ BREAKING CHANGES

* throttle glue requests ([#574](https://github.com/meinestadt/glue-schema-registry/issues/574))

### Features

* throttle glue requests ([#574](https://github.com/meinestadt/glue-schema-registry/issues/574)) ([3299c61](https://github.com/meinestadt/glue-schema-registry/commit/3299c61c9a14048c911de20d48d0dbd9716adbb6))

## [2.1.0](https://github.com/meinestadt/glue-schema-registry/compare/v2.0.0...v2.1.0) (2025-01-13)


### Features

* add exception property to AnalyzeMessageResult for better error handling ([1558699](https://github.com/meinestadt/glue-schema-registry/commit/15586996d47b60c46f76720748e1a2dfd1a3cc1b))
* use zlib from stdlib ([d130069](https://github.com/meinestadt/glue-schema-registry/commit/d130069fb0943eba83dd4636da652cad11eb2e5c))

## [2.0.0](https://github.com/meinestadt/glue-schema-registry/compare/v1.4.2...v2.0.0) (2023-03-24)


### ⚠ BREAKING CHANGES

* migrated from AWS SDK v2 to AWS SDK v3 ([#171](https://github.com/meinestadt/glue-schema-registry/issues/171))

### Features

* migrated from AWS SDK v2 to AWS SDK v3 ([#171](https://github.com/meinestadt/glue-schema-registry/issues/171)) ([2230300](https://github.com/meinestadt/glue-schema-registry/commit/22303002407ee0f7d8bfe18573ae312dd318ed40))

## [1.4.2](https://github.com/meinestadt/glue-schema-registry/compare/v1.4.1...v1.4.2) (2023-02-15)


### Bug Fixes

* fixed pipeline to run unit tests on release please ([#119](https://github.com/meinestadt/glue-schema-registry/issues/119)) ([8b996b5](https://github.com/meinestadt/glue-schema-registry/commit/8b996b5fe5d14ec19674ccfed14d395e897d94d4))

## [1.4.1](https://github.com/meinestadt/glue-schema-registry/compare/v1.4.0...v1.4.1) (2023-02-15)


### Bug Fixes

* check for schema registration failure ([#113](https://github.com/meinestadt/glue-schema-registry/issues/113)) ([8c681cb](https://github.com/meinestadt/glue-schema-registry/commit/8c681cb86b3dd260ce6220b83c7ac673df265d76))

## [1.4.0](https://github.com/meinestadt/glue-schema-registry/compare/v1.3.1...v1.4.0) (2023-01-27)


### Features

* added analyze method which returns meta data for a given message ([123022d](https://github.com/meinestadt/glue-schema-registry/commit/123022d03c31c501ed089b0084cf0773271a2d85))

## [1.3.1](https://github.com/meinestadt/glue-schema-registry/compare/v1.3.0...v1.3.1) (2023-01-06)


### Bug Fixes

* removed unnecessary dependency "remove" ([10214cf](https://github.com/meinestadt/glue-schema-registry/commit/10214cf43f0d0658a6c8fd9830ad391a0f2ea3cc))

## [1.3.0](https://github.com/meinestadt/glue-schema-registry/compare/v1.2.0...v1.3.0) (2023-01-06)


### Features

* switched to async zlib functions, fixes [#56](https://github.com/meinestadt/glue-schema-registry/issues/56) ([5a47039](https://github.com/meinestadt/glue-schema-registry/commit/5a47039e23448ec3b1e1a29b5ba38bcc9e6d7e18))

## [1.2.0](https://github.com/meinestadt/glue-schema-registry/compare/v1.1.1...v1.2.0) (2023-01-03)


### Features

* smaller performance and code improvements ([cff07c1](https://github.com/meinestadt/glue-schema-registry/commit/cff07c1dd36518706d20da1f5fc8bb8693f03944))


### Bug Fixes

* fixed typo in error message ([78c94a3](https://github.com/meinestadt/glue-schema-registry/commit/78c94a3691fc5940d6288791a25d1a72e95cb2ec))

## [1.1.1](https://github.com/meinestadt/glue-schema-registry/compare/v1.1.0...v1.1.1) (2022-12-27)


### Bug Fixes

* removed junit.xml from deployment ([911743f](https://github.com/meinestadt/glue-schema-registry/commit/911743f43e25a09daa1614b658953d042b835028))

## [1.1.0](https://github.com/meinestadt/glue-schema-registry/compare/v1.0.1...v1.1.0) (2022-12-27)


### Features

* support for node12 ([f7476b3](https://github.com/meinestadt/glue-schema-registry/commit/f7476b3a656f234a13b971f0e4f0098de877f2ed))

## [1.0.1](https://github.com/meinestadt/glue-schema-registry/compare/v1.0.0...v1.0.1) (2022-12-27)


### Bug Fixes

* exclude test and coverage folders from deployment ([05fa1f6](https://github.com/meinestadt/glue-schema-registry/commit/05fa1f6bd099cbe6e341dc8bdf36746cdb780449))

## [1.0.0](https://github.com/meinestadt/glue-schema-registry/compare/v0.5.0...v1.0.0) (2022-12-27)


### ⚠ BREAKING CHANGES

* first major release

### Features

* first major release ([5ef9128](https://github.com/meinestadt/glue-schema-registry/commit/5ef9128bf60327b2076aa187d3ed3bdc935ea58e))

## [0.5.0](https://github.com/meinestadt/glue-schema-registry/compare/v0.4.2...v0.5.0) (2022-12-27)


### Features

* added unit tests ([8006897](https://github.com/meinestadt/glue-schema-registry/commit/80068971447fb108b25360b2424ddd82136b4f1a))


### Bug Fixes

* changed name of build and test pipeline ([a061445](https://github.com/meinestadt/glue-schema-registry/commit/a061445a00e852a7b33382a2c7ebf493ada77943))
* encode did not create uncompressed messages when the compress flag was false ([af273fb](https://github.com/meinestadt/glue-schema-registry/commit/af273fb028bdad3b22f8d654eedc1f02b709d6da))

## [0.4.2](https://github.com/meinestadt/glue-schema-registry/compare/v0.4.1...v0.4.2) (2022-12-24)


### Bug Fixes

* **deps:** bump aws-sdk from 2.1280.0 to 2.1281.0 ([39463a8](https://github.com/meinestadt/glue-schema-registry/commit/39463a8671fb77003c7e3d389192505c621ef562))

## [0.4.1](https://github.com/meinestadt/glue-schema-registry/compare/v0.4.0...v0.4.1) (2022-12-22)


### Bug Fixes

* configured dependabot to use prefixes for commit messages ([4f99e3c](https://github.com/meinestadt/glue-schema-registry/commit/4f99e3c86c1b74149548b805d638997ea7708e28))

## [0.4.0](https://github.com/meinestadt/glue-schema-registry/compare/v0.3.3...v0.4.0) (2022-12-20)


### Features

* added possibility to update the Glue client ([f2576db](https://github.com/meinestadt/glue-schema-registry/commit/f2576db4aafc7cf79a386d76788e447ee4ad3b78))


### Bug Fixes

* made property registryName readonly ([94d0bcf](https://github.com/meinestadt/glue-schema-registry/commit/94d0bcfea91015d791ec7b39e69917601962b986))

## [0.3.3](https://github.com/meinestadt/glue-schema-registry/compare/v0.3.2...v0.3.3) (2022-12-15)


### Bug Fixes

* **ci:** merged release-please and npm publish pipeline ([80fad62](https://github.com/meinestadt/glue-schema-registry/commit/80fad621561e2de3bc43d2062768ef2534c9e379))

## [0.3.2](https://github.com/meinestadt/glue-schema-registry/compare/v0.3.1...v0.3.2) (2022-12-15)


### Bug Fixes

* **ci:** changed release trigger to "released" ([5ab0e5d](https://github.com/meinestadt/glue-schema-registry/commit/5ab0e5daf41b5c61285bce5e5f81965c4c56cbca))

## [0.3.1](https://github.com/meinestadt/glue-schema-registry/compare/v0.3.0...v0.3.1) (2022-12-15)


### Bug Fixes

* **ci:** changed release trigger to "published" ([96bea30](https://github.com/meinestadt/glue-schema-registry/commit/96bea302ac29a0a246fb8177df0d9e2f69ceece6))

## [0.3.0](https://github.com/meinestadt/glue-schema-registry/compare/v0.2.0...v0.3.0) (2022-12-15)


### Features

* **ci:** added release-please pipeline ([e9e2dbe](https://github.com/meinestadt/glue-schema-registry/commit/e9e2dbe70c51eae370b8886d9b2fdaa56b3d4436))
