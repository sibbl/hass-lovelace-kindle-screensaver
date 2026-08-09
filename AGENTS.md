# Home Assistant Lovelace Kindle Screensaver

This is a strict TypeScript application that generates Kindle-compatible screensaver images from Home Assistant Lovelace dashboards using Puppeteer (headless Chrome) and image processing tools.

Use these repository instructions as the primary guide, and verify anything that no longer matches the worktree.

## Working Effectively

### System Dependencies

Install required system dependencies before starting:

- `sudo apt-get update` -- takes 30-60 seconds
- `sudo apt-get install -y imagemagick graphicsmagick` -- takes 60-120 seconds
- Browser: The application requires Chrome/Chromium but cannot download it in restricted environments. Use Docker instead for full functionality.

### Bootstrap and Dependencies

- Local quality tooling requires Node.js 20.19+ (or 22.12+).
- `PUPPETEER_SKIP_DOWNLOAD=true npm ci` -- ALWAYS set `PUPPETEER_SKIP_DOWNLOAD=true` to avoid downloading Chromium during dependency installation.
- Build: `npm run build` compiles `src/` into `dist/`.
- Format: `npm run format` writes oxfmt changes; `npm run format:check` only checks them.
- Lint: `npm run lint` runs oxlint with warnings denied; `npm run lint:fix` applies safe fixes.
- Complete validation: `npm run validate` checks formatting, lints, type-checks source and tests, runs Vitest, and builds the production output.
- Docker e2e: `npm run test:e2e` renders the committed dashboard fixture against a pinned real Home Assistant container and validates the resulting image and HTTP behavior.

### Running the Application

**CRITICAL**: This application requires a working Home Assistant instance to be fully functional. Without it, the application will fail during browser launch or screenshot generation.

#### Required Environment Variables

Set these before running:

```bash
export HA_BASE_URL="https://your-home-assistant-instance:8123"
export HA_SCREENSHOT_URL="/lovelace"  # or "/lovelace/dashboard-name"
export HA_ACCESS_TOKEN="your-long-lived-access-token"
```

#### Local Development (Limited - requires external Home Assistant)

- `npm run validate` -- checks formatting and lint, type-checks, tests, and builds the application
- `npm start` -- runs the compiled application from `dist/`
- The application will fail with "Could not find expected browser" without Chrome/Chromium installed
- For testing without a browser: Set `DEBUG=true` to see how far initialization gets

#### Docker Development (Recommended)

- `docker-compose up -d` -- runs the application in Docker with all dependencies
- **NEVER CANCEL**: Docker build can take 10-20 minutes depending on network. Set timeout to 30+ minutes.
- Access the service at `http://localhost:5000/` to get the latest generated image
- Build will fail in restricted network environments due to Alpine package downloads

### Testing and Validation

**CRITICAL**: Since this application requires Home Assistant integration, complete testing requires:

1. A working Home Assistant instance
2. Valid access tokens
3. Accessible Lovelace dashboards

#### Manual Validation Scenarios

After making code changes, test these scenarios:

1. **Configuration Validation**: Run `npm start` with missing environment variables to verify proper error handling
2. **Image Generation**: With valid HA credentials, verify images are generated in the `output/` directory
3. **HTTP Server**: Test `curl http://localhost:5000/` returns the generated image with proper headers
4. **Multiple Pages**: Test multiple screenshot URLs using `HA_SCREENSHOT_URL_2`, `HA_SCREENSHOT_URL_3` etc.

#### Build Validation

- **NEVER CANCEL**: Docker builds may take 10-20 minutes in good network conditions, longer in restricted environments
- Use `time docker build -t test .` to measure actual build time (expect 10+ minutes)
- Test GraphicsMagick functionality: `gm version`
- Test ImageMagick functionality: `convert --version`

## Common Tasks and Expected Outcomes

### Repository Structure

```
/
├── src/                  # Typed application modules and entry point
├── tests/                # Typed regression test suite
├── tests/e2e/            # Real Home Assistant Docker e2e fixture
├── .oxfmtrc.json         # oxfmt configuration
├── .oxlintrc.json        # oxlint configuration
├── tsconfig.json         # Strict type-checking configuration
├── tsconfig.build.json   # Production compilation configuration
├── package.json          # Node.js dependencies (minimal build config)
├── Dockerfile            # Alpine-based container definition
├── docker-compose.yml    # Local development setup
├── run.sh                # Home Assistant add-on entry script
├── config.yaml           # Home Assistant add-on configuration
└── output/               # Generated images directory (created at runtime)
```

### Key Environment Variables (Complete List)

**Required:**

- `HA_BASE_URL` - Home Assistant instance URL
- `HA_SCREENSHOT_URL` - Lovelace dashboard path
- `HA_ACCESS_TOKEN` - Long-lived access token

**Optional but Important:**

- `USE_IMAGE_MAGICK=false` - Use GraphicsMagick instead (default)
- `DEBUG=true` - Non-headless mode for debugging
- `PORT=5000` - HTTP server port
- `CRON_JOB=* * * * *` - Screenshot frequency (every minute by default)
- `OUTPUT_PATH=./output` - Image output directory
- `RENDERING_TIMEOUT=10000` - Page load timeout in milliseconds
- `RENDERING_DELAY=0` - Wait time before screenshot
- `ROTATION=0` - Image rotation in degrees

### Network and Dependencies Limitations

In restricted environments:

- Docker builds will fail due to Alpine package downloads
- Puppeteer cannot download Chromium (solved by PUPPETEER_SKIP_DOWNLOAD=true)
- External package repositories may be inaccessible
- Always document actual failure points rather than assuming they work

### Application Behavior Without Home Assistant

- Exits immediately with "Please check your configuration" if environment variables missing
- Fails with browser launch error if no Chrome/Chromium available
- Cannot generate screenshots without valid HA instance access
- HTTP server will not start without valid configuration

### Home Assistant Add-on Integration

- Uses `run.sh` script to load configuration from Home Assistant
- Supports additional environment variables via `ADDITIONAL_ENV_VARS` array
- Configured via `config.yaml` with schema validation
- Maps output to `/output` volume for persistence

## Do Not Attempt

- **Building in restricted networks**: Docker builds require internet access for Alpine packages
- **Running without environment variables**: Application will immediately exit
- **Installing system Chrome**: Use Docker approach instead in constrained environments
- **Long running tests without HA**: Application cannot complete initialization without valid Home Assistant access

## Debugging Common Issues

- **"Please check your configuration"**: Missing required environment variables
- **"Could not find expected browser"**: Missing Chrome/Chromium, use Docker instead
- **"Network error"**: Use `PUPPETEER_SKIP_DOWNLOAD=true` for `npm ci`
- **Docker build failures**: Network restrictions prevent Alpine package downloads
- **Connection timeouts**: Home Assistant instance not accessible from current network

Always run `npm start` first to identify configuration issues before attempting more complex debugging.
