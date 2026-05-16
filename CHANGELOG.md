# Changelog

## 1.0.16

### Added

* Add optional HTTP Basic Auth support for the rendered image endpoint
* Add image change detection with ETag/HEAD support to reduce unnecessary Kindle image downloads
* Add `HA_THEME` to explicitly select a Home Assistant theme
* Add `.env` support for local configuration

### Fixed

* Validate required Home Assistant configuration earlier to avoid first-run `ERR_NAME_NOT_RESOLVED` failures
* Keep the HTTP server available when browser initialization or rendering fails, and retry browser startup after failures
* Update deprecated Home Assistant theme CSS variables for Home Assistant 2025.5+ compatibility

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
