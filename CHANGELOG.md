# Changelog

## 1.3.0

### Added

- Add oxfmt and oxlint formatting, linting, and CI validation
- Add reusable Docker end-to-end coverage against a pinned real Home Assistant instance for standalone and add-on images, authenticated multi-page rendering, HTTP caching, and runtime fonts

### Changed

- Migrate the application and regression suite to strict TypeScript with focused configuration, browser, rendering, scheduling, battery, and HTTP modules
- Replace Puppeteer with Playwright Core and the architecture-native system Chromium package, avoiding unavailable bundled browser binaries on supported ARM platforms
- Modernize container builds to Node.js 22, Alpine 3.22, pinned Home Assistant base images, multi-stage production builds, current GitHub Actions, and preserved CJK and emoji font support
- Update application and test dependencies, including cron 4 and Vitest 4

### Fixed

- Seed Home Assistant authentication storage before the first navigation to avoid an initial unauthenticated request

## 1.2.0

### Added

- Support page-specific HTTP Basic Auth credentials with numbered `HTTP_AUTH_USER_n` and `HTTP_AUTH_PASSWORD_n` variables

### Fixed

- Pass configured HTTP Basic Auth credentials into the Home Assistant Add-On runtime

## 1.1.0

### Added

- Support rendering pages from multiple Home Assistant instances with numbered `HA_BASE_URL_n`, `HA_ACCESS_TOKEN_n`, `HA_THEME_n`, and `LANGUAGE_n` variables
- Isolate Home Assistant sessions in browser contexts while sharing one Chromium process

### Fixed

- Send battery webhook updates to the Home Assistant instance configured for each page
- Avoid exposing additional environment variable values such as access tokens in Home Assistant Add-On logs

## 1.0.19

### Added

- Add on-demand rendering endpoints for all pages or a single page
- Add browser cache reset support with an optional browser cache TTL
- Add conditional image responses using `ETag` and `Last-Modified` validators
- Add render status headers for refresh requests

### Fixed

- Keep page-specific refreshes from masking stale all-page render health

## 1.0.18

### Added

- Add a render health endpoint and wire Docker/Home Assistant health checks to detect stale renders

### Fixed

- Recover from stale render locks by bounding render jobs and restarting Chromium after render timeouts
- Add step-level render, screenshot, conversion, and file replacement timeouts with clearer error logging

## 1.0.17

### Added

- Add Home Assistant add-on and Docker Compose configuration entries for optional HTTP Basic Auth
- Add Vitest coverage for output path and image format handling

### Fixed

- Preserve configured `jpeg` and `bmp` output formats when writing converted temp files
- Force GraphicsMagick to write the configured output format instead of inferring PNG from temp paths

## 1.0.16

### Added

- Add optional HTTP Basic Auth support for the rendered image endpoint
- Add image change detection with ETag/HEAD support to reduce unnecessary Kindle image downloads
- Add `HA_THEME` to explicitly select a Home Assistant theme
- Add `.env` support for local configuration

### Fixed

- Validate required Home Assistant configuration earlier to avoid first-run `ERR_NAME_NOT_RESOLVED` failures
- Keep the HTTP server available when browser initialization or rendering fails, and retry browser startup after failures
- Update deprecated Home Assistant theme CSS variables for Home Assistant 2025.5+ compatibility

## 1.0.15

### Added

- Support Chinese and Japanese characters by adding CJK fonts (thanks to [@karmeleon](https://github.com/karmeleon))

## 1.0.14

### Added

- Bmp file format support for image generation (thanks to [@macmacs](https://github.com/macmacs))

## 1.0.13

### Added

- Allow configuring contrast, saturation, black level and white level. JPEG quality is set to 100% (thanks to [@harry48225](https://github.com/harry48225))

## 1.0.12

### Fixed

- Fix scaling bug by using zoom css property instead of transforms (thanks to [@avhm](https://github.com/avhm))

## 1.0.11

### Fixed

- Avoid viewport resize causing another rerender when taking screenshot (thanks to [@beeh5](https://github.com/beeh5))

## 1.0.10

### Fixed

- Fix REMOVE_GAMMA and DITHER always being enabled for Home Assistant Add-On

## 1.0.9

### Added

- Add jpeg support via new `IMAGE_TYPE` config env variable (thanks to [@nbarrientos](https://github.com/nbarrientos))

## 1.0.8

### Fixed

- Remove DITHER option from Home Assistant Add-On again until the gm/im incompatibility will be fixed

## 1.0.7

### Added

- Finally there's a changelog
- Allow custom environment variables to Home Assistant Add-On

### Fixed

- Add missing config variables to Home Assistant Add-On
