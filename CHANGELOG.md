<!-- markdownlint-disable MD024 -->

# Changelog

## 1.1.0

### Added

* Add explicit `HA_THEME` support to control the Home Assistant theme used for rendering
* Add optional HTTP Basic Auth for the generated image endpoint via `HTTP_AUTH_USER` and `HTTP_AUTH_PASSWORD`
* Add early configuration validation to catch invalid first-run setups before rendering starts
* Add support for energy-efficient image updates with SHA-256 change detection, metadata stripping, `ETag`/`Last-Modified` handling, and `HEAD` request support

### Changed

* Migrate browser automation from Puppeteer to Playwright and use isolated browser contexts for rendering
* Migrate the codebase from JavaScript to strict TypeScript and remove the legacy JS source layout
* Upgrade the Docker/runtime stack to Node.js 24 on Alpine and configure Playwright to use system Chromium

### Fixed

* Ignore favicon requests and start the HTTP server earlier during startup
* Avoid unnecessary image rewrites when the rendered output has not changed and guard against missing screenshot files after failed renders

## 1.0.15

### Added

* Support Chinese and Japanese characters by adding CJK fonts (thanks to [@karmeleon](https://github.com/karmeleon))

## 1.0.14

### Added

* Bmp file format support for image generation (thanks to [@macmacs](https://github.com/macmacs))

## 1.0.13

### Added

* Allow configuring contrast, saturation, black level and white level. JPEG quality is set to 100% (thanks to [@harry48225](https://github.com/harry48225))

## 1.0.12

### Fixed

* Fix scaling bug by using zoom css property instead of transforms (thanks to [@avhm](https://github.com/avhm))

## 1.0.11

### Fixed

* Avoid viewport resize causing another rerender when taking screenshot (thanks to [@beeh5](https://github.com/beeh5))

## 1.0.10

### Fixed

* Fix REMOVE_GAMMA and DITHER always being enabled for Home Assistant Add-On

## 1.0.9

### Added

* Add jpeg support via new `IMAGE_TYPE` config env variable (thanks to [@nbarrientos](https://github.com/nbarrientos))

## 1.0.8

### Fixed

* Remove DITHER option from Home Assistant Add-On again until the gm/im incompatibility will be fixed

## 1.0.7

### Added

* Finally there's a changelog
* Allow custom environment variables to Home Assistant Add-On

### Fixed

* Add missing config variables to Home Assistant Add-On
