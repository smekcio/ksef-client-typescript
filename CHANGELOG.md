# Changelog

## Unreleased

### Features

- **api:** add collective identifier helpers, pagination iterators and CLI `ksef-ts iz`

### Bug Fixes

- **verification-link:** sign QR II certificate URLs with the raw path and KSeF-compliant RSA-PSS parameters

## [0.7.1](https://github.com/smekcio/ksef-client-typescript/compare/v0.7.0...v0.7.1) (2026-08-05)


### Bug Fixes

* **fa3:** split VAT summary into P_13/P_14 rate buckets ([#47](https://github.com/smekcio/ksef-client-typescript/issues/47)) ([dc58cc4](https://github.com/smekcio/ksef-client-typescript/commit/dc58cc4539edd39bfdb5b0a8da445e14eab3aaf6))

## [0.7.0](https://github.com/smekcio/ksef-client-typescript/compare/v0.6.4...v0.7.0) (2026-07-27)


### Features

* align with KSeF API 2.7.0 ([#45](https://github.com/smekcio/ksef-client-typescript/issues/45)) ([263642b](https://github.com/smekcio/ksef-client-typescript/commit/263642be333029f819868f24d40cfdbedf39f689))

## [0.6.4](https://github.com/smekcio/ksef-client-typescript/compare/v0.6.3...v0.6.4) (2026-07-13)

### Bug Fixes

- **fa3:** FA(3) XML fixes for KSeF acceptance ([#43](https://github.com/smekcio/ksef-client-typescript/issues/43)) ([c956edd](https://github.com/smekcio/ksef-client-typescript/commit/c956edd7543db254eee4260b7cc057c9a20469ed))

## [0.6.3](https://github.com/smekcio/ksef-client-typescript/compare/v0.6.2...v0.6.3) (2026-07-09)

### Bug Fixes

- **fa3:** omit empty P_1M and emit required Adnotacje block ([#41](https://github.com/smekcio/ksef-client-typescript/issues/41)) ([68bf7dc](https://github.com/smekcio/ksef-client-typescript/commit/68bf7dc25d7f735c6d950b8bb116a4582a10cca9))

## [0.6.2](https://github.com/smekcio/ksef-client-typescript/compare/v0.6.1...v0.6.2) (2026-07-09)

### Bug Fixes

- **fa3:** emit WariantFormularza=3 in invoice builder ([#39](https://github.com/smekcio/ksef-client-typescript/issues/39)) ([ed43d3a](https://github.com/smekcio/ksef-client-typescript/commit/ed43d3a1d7c4c09fefb6326c0044398b3826ad39))

## [0.6.1](https://github.com/smekcio/ksef-client-typescript/compare/v0.6.0...v0.6.1) (2026-07-08)

### Bug Fixes

- **xades:** repair CJS xml-crypto interop for certificate auth ([#37](https://github.com/smekcio/ksef-client-typescript/issues/37)) ([df48900](https://github.com/smekcio/ksef-client-typescript/commit/df489006dc5820c489c11ad6fff3039f0f214e1f))

## [0.6.0](https://github.com/smekcio/ksef-client-typescript/compare/v0.5.2...v0.6.0) (2026-07-08)

### Features

- FA(3) typed SDK, CLI session checkpoints, and workflow extensions ([#34](https://github.com/smekcio/ksef-client-typescript/issues/34)) ([d731f14](https://github.com/smekcio/ksef-client-typescript/commit/d731f14815184a33f5e027969770f78e210f756b))

## [0.5.2](https://github.com/smekcio/ksef-client-typescript/compare/v0.5.1...v0.5.2) (2026-04-20)

### Bug Fixes

- **verification-link:** correct QR II signing ([#31](https://github.com/smekcio/ksef-client-typescript/issues/31)) ([6d1bf09](https://github.com/smekcio/ksef-client-typescript/commit/6d1bf09f5b93a2facc3eb09337983a4fef135e38))

## [0.5.1](https://github.com/smekcio/ksef-client-typescript/compare/v0.5.0...v0.5.1) (2026-04-19)

### Bug Fixes

- support encrypted private key passwords in verification link ([#29](https://github.com/smekcio/ksef-client-typescript/issues/29)) ([c576f0f](https://github.com/smekcio/ksef-client-typescript/commit/c576f0fb3195d668ad9e603285a654774e630122))

## [0.5.0](https://github.com/smekcio/ksef-client-typescript/compare/v0.4.1...v0.5.0) (2026-04-14)

### Features

- **api:** align TypeScript SDK with KSeF API 2.4.0, enhance error handling and documentation ([#27](https://github.com/smekcio/ksef-client-typescript/issues/27)) ([aacfd7e](https://github.com/smekcio/ksef-client-typescript/commit/aacfd7e0aaad9a4d96608a5f5bf4f94d4ba27df2))

## [0.4.1](https://github.com/smekcio/ksef-client-typescript/compare/v0.4.0...v0.4.1) (2026-03-26)

### Bug Fixes

- **ci:** publish releases from dedicated trusted workflows ([#23](https://github.com/smekcio/ksef-client-typescript/issues/23)) ([2620436](https://github.com/smekcio/ksef-client-typescript/commit/2620436e6649d9f9bc6a9358c9713768c2fdf749))
- **ci:** use node 24 for npm trusted publishing ([4ce1675](https://github.com/smekcio/ksef-client-typescript/commit/4ce1675dc2b671975d6e885cbdb272334fd95d48))

## [0.4.0](https://github.com/smekcio/ksef-client-typescript/compare/v0.3.1...v0.4.0) (2026-03-20)

### Features

- **api:** align TypeScript SDK with KSeF API 2.3.0 ([#20](https://github.com/smekcio/ksef-client-typescript/issues/20)) ([744d207](https://github.com/smekcio/ksef-client-typescript/commit/744d20746747647b2f9866d1e1ce5dc3ec4a6fc5))

## [0.3.1](https://github.com/smekcio/ksef-client-typescript/compare/v0.3.0...v0.3.1) (2026-03-05)

### Bug Fixes

- **ci:** stabilize zip tests on node20 and restore 100% branch coverage ([ebc26b5](https://github.com/smekcio/ksef-client-typescript/commit/ebc26b5d1802fa5b9b5d3335e677174dfe64bb11))

## [0.3.0](https://github.com/smekcio/ksef-client-typescript/compare/v0.2.0...v0.3.0) (2026-03-03)

### Features

- **api:** align TypeScript SDK with KSeF API 2.2.0 ([#16](https://github.com/smekcio/ksef-client-typescript/issues/16)) ([0968f9c](https://github.com/smekcio/ksef-client-typescript/commit/0968f9c1edb4976bff50d763576663a4a95bd49b))
- **ts:** lighthouse API, CLI i wzmocnienie HTTP/export oraz CI ([#14](https://github.com/smekcio/ksef-client-typescript/issues/14)) ([e86d1ca](https://github.com/smekcio/ksef-client-typescript/commit/e86d1ca60b06371b66019397b9be3b2246b8b490))

## [0.2.0](https://github.com/smekcio/ksef-client-typescript/compare/v0.1.0...v0.2.0) (2026-02-19)

### Features

- add offline workflow coverage and docs updates ([416fc7b](https://github.com/smekcio/ksef-client-typescript/commit/416fc7ba8765b938152f95311c83f54c7237e14c))
- align SDK parity with ksef docs and expand docs/tests/ci ([d0ea81f](https://github.com/smekcio/ksef-client-typescript/commit/d0ea81f2a252a37cf145528d47c686bb7575f28d))
- align typescript sdk with ksef docs 2.1.2 ([311b1c4](https://github.com/smekcio/ksef-client-typescript/commit/311b1c4b0c1c534bbbdcbf7f87b87cffd3abede9))
- **typescript:** add XAdES signing (enveloped/enveloping) ([b8c85d4](https://github.com/smekcio/ksef-client-typescript/commit/b8c85d4af7c748e03cb1f325832a4bee8409b294))

### Bug Fixes

- **ci:** always report required checks for release-please PRs ([83a1d74](https://github.com/smekcio/ksef-client-typescript/commit/83a1d746f8055594e8eddaa725c6d230a96809b8))
- **xades:** emit ECDSA signatures in P1363 format ([#3](https://github.com/smekcio/ksef-client-typescript/issues/3)) ([5df7173](https://github.com/smekcio/ksef-client-typescript/commit/5df71738bbea716bb85da8a3fd7d3f2d971e7ccb))
- **xades:** prefer end-entity cert when loading PKCS[#12](https://github.com/smekcio/ksef-client-typescript/issues/12) ([b38e0d1](https://github.com/smekcio/ksef-client-typescript/commit/b38e0d1b9ba87a7d44c7a14f510aaaa0f6d1d64d))
- **xades:** satisfy lint for ECDSA P1363 signing key types ([#5](https://github.com/smekcio/ksef-client-typescript/issues/5)) ([3108eea](https://github.com/smekcio/ksef-client-typescript/commit/3108eea704d7af4a27459946d3df91948cd9936e))
