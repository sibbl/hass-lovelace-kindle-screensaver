# Changelog

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
