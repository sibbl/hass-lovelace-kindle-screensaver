---
name: code-style
description: Guidelines and conventions for maintaining consistent code style across the project.
---

## Strict Configuration

- `strict: true` in tsconfig.json
- `noUncheckedIndexedAccess: true` - array/object index access returns `T | undefined`
- `noUnusedLocals: true`, `noUnusedParameters: true`
- No `any` or `unknown` types allowed (enforced by oxlint)

## Type Definitions

All shared interfaces live in `src/types.ts`:

- `PageConfig` - per-page screenshot configuration
- `AppConfig` - full application configuration
- `BatteryState` - battery level tracking per device
- `BatteryStore` - Record of battery states indexed by page number

## Environment Variable Parsing

Use helper functions from `src/config.ts`:

- `parseNumber(value, defaultValue)` - parse string to number with fallback
- `parseImageFormat(value)` - validate "png" or "jpeg"
- `parseColorMode(value)` - validate "GrayScale" or "TrueColor"
- `parsePrefersColorScheme(value)` - validate "light" or "dark"

Never leave env vars as raw strings when the type should be numeric.

## Module Conventions

- Use `node:` protocol for Node.js built-in imports (`node:fs`, `node:path`, etc.)
- Export named functions (no default exports)
- One module per concern (config, server, image, etc.)

## gm (GraphicsMagick) Typing

The `@types/gm` package has incomplete typings. Workarounds:

- Use `gm.subClass({ imageMagick: true })` instead of `.options()`
- Use `.out("-flag", "value")` for methods not in type definitions
- `gamma()` requires 3 args: `.gamma(val, val, val)`
