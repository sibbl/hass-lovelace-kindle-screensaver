# Home Assistant Lovelace Kindle Screensaver

This is a Node.js application that generates Kindle-compatible screensaver images from Home Assistant Lovelace dashboards using Puppeteer (headless Chrome) and image processing tools.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### System Dependencies
Install required system dependencies before starting:
- `sudo apt-get update` -- takes 30-60 seconds
- `sudo apt-get install -y imagemagick graphicsmagick` -- takes 60-120 seconds
- Browser: The application requires Chrome/Chromium but cannot download it in restricted environments. Use Docker instead for full functionality.

### Bootstrap and Dependencies
- `PUPPETEER_SKIP_DOWNLOAD=true npm install` -- takes 1-2 seconds. ALWAYS use PUPPETEER_SKIP_DOWNLOAD=true to avoid network download failures.
- Build TypeScript: `npm run build` compiles src/ to dist/.
- Type check: `npm run typecheck`

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
- `npm start` -- runs the application directly
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
```text
/
├── src/                  # TypeScript source files
│   ├── index.ts          # Entry point (cron, orchestration)
│   ├── types.ts          # Shared interfaces
│   ├── config.ts         # Environment variable parsing
│   ├── validate.ts       # Configuration validation
│   ├── hash.ts           # File hashing (SHA-256)
│   ├── image.ts          # Image conversion (gm)
│   ├── battery.ts        # Battery webhook to HA
│   ├── server.ts         # HTTP server
│   └── renderer.ts       # Puppeteer screenshot pipeline
├── dist/                 # Compiled JS output (gitignored)
├── tests/
│   ├── unit/             # Vitest unit tests
│   └── e2e/              # Playwright e2e tests
├── tsconfig.json         # TypeScript config (strict)
├── .oxlintrc.json        # oxlint config
├── package.json          # Dependencies and scripts
├── Dockerfile            # Multi-stage Alpine build
├── Dockerfile.HA_ADDON   # Home Assistant add-on build
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
- **"Network error"**: Use PUPPETEER_SKIP_DOWNLOAD=true for npm install
- **Docker build failures**: Network restrictions prevent Alpine package downloads
- **Connection timeouts**: Home Assistant instance not accessible from current network

Always run `npm start` first to identify configuration issues before attempting more complex debugging.