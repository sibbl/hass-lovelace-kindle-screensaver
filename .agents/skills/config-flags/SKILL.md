---
name: config-flags
description: Checklist for adding or changing environment/config flags while keeping the parser, Home Assistant add-on, and documentation in sync.
---

## When to use

Use this skill whenever you add, remove, rename, or change a configuration flag or environment variable.

Typical triggers:
- adding a new env var
- changing a default value
- exposing an existing env var in the Home Assistant add-on
- introducing a new per-page / suffixed option
- updating supported values for an existing flag

## Source of truth

Start here first:
- `src/config.ts` — authoritative parser
  - `loadConfig()` contains global flags
  - `getPagesConfig()` contains page-scoped flags
- `src/types.ts` — `AppConfig` and `PageConfig` must match the parser
- `src/validate.ts` — add cross-field or semantic validation rules here when needed

Do not update docs or add-on wiring based on guesswork. Confirm the parser behavior first.

## Backwards-compatibility rules

- Prefer additive changes with safe defaults.
- Keep existing behavior unchanged when a flag is unset, unless a breaking change is intentional and documented.
- Do not silently change the meaning of an existing flag.
- If you rename or replace a flag, consider a compatibility alias period instead of a hard cutover.
- If a flag is optional, keep the unset case working exactly as before.

## Global vs. page-scoped flags

Use the parser to determine the category:
- Flags read in `loadConfig()` are global.
- Flags read via `getEnvironmentVariable()` inside `getPagesConfig()` are page-scoped and support suffixed overrides like `_2`, `_3`, and so on.

Examples of page-scoped flags include `ROTATION`, `IMAGE_FORMAT`, `OUTPUT_PATH`, `REMOVE_GAMMA`, `PREFERS_COLOR_SCHEME`, `SATURATION`, and `CONTRAST`.

## Array / multi-page behavior

The multi-page feature is driven by `HA_SCREENSHOT_URL`, `HA_SCREENSHOT_URL_2`, `HA_SCREENSHOT_URL_3`, ...

Important rules:
- Pages are discovered sequentially.
- Discovery stops at the first missing `HA_SCREENSHOT_URL_n`.
- You cannot skip an index; if `_2` is missing, `_3` and later pages will not load.
- Most page-scoped flags fall back to the unsuffixed value when `*_n` is missing.
- `OUTPUT_PATH` is the special case: if `OUTPUT_PATH_n` is missing, the app falls back to `output/cover_n` for that page.

For the Home Assistant add-on, suffixed overrides belong in `ADDITIONAL_ENV_VARS`.

## Files to update when adding a flag

Check each of these on every config change:

1. `src/config.ts`
   - parse the flag
   - set defaults
   - keep fallback behavior intentional
2. `src/types.ts`
   - update `AppConfig` or `PageConfig` if the shape changes
3. `src/validate.ts`
   - add validation if the flag has allowed values, ranges, or cross-field dependencies
4. `config.yaml`
   - add an add-on option and schema entry if the flag should be exposed in the Home Assistant UI
5. `run.sh`
   - export every add-on option from `config.yaml`
6. `README.md`
   - update the config table, accepted values, array support, examples, and add-on notes
7. `CHANGELOG.md`
   - document user-visible config changes
8. `.env.sample`
   - update only when it meaningfully improves discoverability
9. tests
   - add or adjust tests if parsing, validation, or runtime behavior changes

## Home Assistant add-on rules

Not every env var should become a normal add-on UI option.

Current repo expectations:
- User-facing render/auth/theme/debug flags can be exposed in `config.yaml`.
- Add-on-managed runtime knobs should stay managed unless the architecture intentionally changes.
- In this repo, the add-on currently manages `PORT`, the default `OUTPUT_PATH`, and `USE_IMAGE_MAGICK`.
- If `config.yaml` exposes an option, `run.sh` must export it.
- Optional secrets should use the appropriate Home Assistant schema type such as `password?`.

When in doubt, prefer documenting an advanced env var and supporting it through `ADDITIONAL_ENV_VARS` instead of exposing a risky knob in the standard add-on UI.

## Documentation expectations

When you add or change a flag:
- update the README config reference
- make the `Array?` column accurate
- document accepted values and defaults when they matter
- explain add-on-specific behavior when the add-on manages a default internally
- keep examples consistent with the actual parser behavior

Do not leave README, `config.yaml`, and `run.sh` out of sync.

## Verification checklist

Before finishing:
- compare README against `loadConfig()` and `getPagesConfig()`
- compare `config.yaml` options/schema against `run.sh`
- confirm array behavior and fallback wording are correct
- run `npm run typecheck`, `npm run lint`, and `npm test` when parsing or behavior changed
- run diagnostics on touched YAML / shell / Markdown files
