# Agent Instructions

## Project Overview

Node.js application that generates Kindle-compatible screensaver images from Home Assistant Lovelace dashboards using Playwright (headless Chromium) and ImageMagick/GraphicsMagick.

## Tech Stack

- **Language**: TypeScript (strict mode, no `any`/`unknown`)
- **Runtime**: Node.js 24 (Alpine in Docker)
- **Browser**: Playwright with system Chromium
- **Image Processing**: gm (GraphicsMagick/ImageMagick)
- **Testing**: Vitest (unit), Playwright (e2e)
- **Linting**: oxlint
- **Formatting**: oxfmt

## Project Structure

```text
src/           # TypeScript source (compiled to dist/)
  types.ts     # All shared interfaces
  config.ts    # Environment variable parsing
  validate.ts  # Configuration validation
  hash.ts      # File hashing (SHA-256)
  image.ts     # Image conversion (gm)
  battery.ts   # Battery webhook to HA
  server.ts    # HTTP server
  renderer.ts  # Playwright screenshot pipeline
  index.ts     # Entry point (cron, orchestration)
tests/
  unit/        # Vitest unit tests
  e2e/         # Playwright e2e tests
dist/          # Compiled JS output (gitignored)
```

## Commands

### Install

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
```

Always use `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` to avoid browser download failures.

### Build

```bash
npm run build
```

### Type Check

```bash
npm run typecheck
```

### Run Tests

```bash
npm test
```

All 74 unit tests must pass before committing.

### Lint

```bash
npm run lint
```

Uses oxlint with `no-explicit-any: error`.

### Format

```bash
npm run format
```

Uses oxfmt. Check with `npm run format:check`.

### Run Application

Requires a working Home Assistant instance. See README.md for required environment variables.

```bash
npm start
```

## Coding Conventions

### TypeScript

- **Strict mode**: `strict: true`, `noUncheckedIndexedAccess: true`
- **No `any` or `unknown`**: All types must be explicit. Define interfaces in `src/types.ts`.
- **Node protocol imports**: Use `node:fs`, `node:path`, `node:crypto`, etc.
- **Parse env values**: Numeric env vars must be parsed with `parseNumber()` from config.ts.
- **gm usage**: Use `gm.subClass()` pattern for ImageMagick mode. The `@types/gm` package has incomplete typings — use `.out()` for unsupported methods.

### Testing

- Tests are in `tests/unit/` using Vitest with `import` syntax.
- Mock environment variables by setting `process.env` directly and restoring in `afterEach`.
- Server tests create actual HTTP servers on random ports.
- Import from `../../src/<module>` (no file extension).

### Docker

- Multi-stage build: builder stage compiles TypeScript, production stage only has runtime deps.
- Base image: `node:24-alpine3.21`
- System deps: chromium, imagemagick, fonts
- Uses `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser` for system Chromium

## Important Notes

- The application exits immediately without valid HA environment variables.
- Cannot run Playwright without Chromium installed (use Docker or `npx playwright install chromium`).
- `config.ts` returns properly typed numeric values; the old JS version returned strings.
- E2e tests require Docker Compose with a Home Assistant container.
