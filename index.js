const config = require("./config");
const path = require("path");
const http = require("http");
const https = require("https");
const { promises: fs } = require("fs");
const fsExtra = require("fs-extra");
const puppeteer = require("puppeteer");
const { CronJob } = require("cron");
const sharp = require("sharp");

// Config directory for additional files that Kindle can download
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, "kindle-config");

// keep state of current battery level and whether the device is charging
const batteryStore = {};

(async () => {
  if (config.pages.length === 0) {
    return console.error("Please check your configuration");
  }
  for (const i in config.pages) {
    const pageConfig = config.pages[i];
    if (pageConfig.rotation % 90 > 0) {
      return console.error(
        `Invalid rotation value for entry ${i + 1}: ${pageConfig.rotation}`
      );
    }
  }

  if (config.debug) {
    console.log(
      "Debug mode active, will only render once in non-headless model and keep page open"
    );
    const browser = await launchBrowserAndLogin();
    renderAndConvertAsync(browser);
  } else {
    console.log("Starting first render...");
    await renderAndConvertAsync();
    console.log("Starting rendering cronjob...");
    new CronJob(
      String(config.cronJob),
      () => renderAndConvertAsync(),
      null,
      true
    );
  }

  const httpServer = http.createServer(async (request, response) => {
    // Parse the request
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;

    // Handle config file requests
    if (pathname.startsWith('/config/')) {
      await handleConfigFileRequest(pathname, response);
      return;
    }

    // Handle image requests (existing functionality)
    await handleImageRequest(url, request, response);
  });

  const port = config.port || 5000;
  httpServer.listen(port, () => {
    console.log(`Server is running at ${port}`);
    console.log(`Config files will be served from: ${CONFIG_DIR}`);
  });
})();

// Handle config file requests with path traversal protection
async function handleConfigFileRequest(pathname, response) {
  try {
    // Remove '/config/' prefix and decode URI component
    const requestedPath = decodeURIComponent(pathname.substring(8));

    // Prevent path traversal attacks
    if (requestedPath.includes('..') || requestedPath.includes('\\') || path.isAbsolute(requestedPath)) {
      console.log(`Blocked suspicious config file request: ${pathname}`);
      response.writeHead(403);
      response.end('Forbidden: Invalid path');
      return;
    }

    // Resolve the full path and ensure it's within CONFIG_DIR
    const fullPath = path.resolve(CONFIG_DIR, requestedPath);
    const configDirResolved = path.resolve(CONFIG_DIR);

    if (!fullPath.startsWith(configDirResolved + path.sep) && fullPath !== configDirResolved) {
      console.log(`Blocked path traversal attempt: ${pathname}`);
      response.writeHead(403);
      response.end('Forbidden: Path traversal detected');
      return;
    }

    // Check if file exists and is a file (not directory)
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      response.writeHead(404);
      response.end('File not found');
      return;
    }

    // Read and serve the file
    const data = await fs.readFile(fullPath);
    const lastModifiedTime = new Date(stat.mtime).toUTCString();

    // Determine content type based on file extension
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = getContentType(ext);

    console.log(`${new Date().toISOString()}: Config file ${requestedPath} was accessed`);

    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': Buffer.byteLength(data),
      'Last-Modified': lastModifiedTime,
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    });
    response.end(data);

  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log(`Config file not found: ${pathname}`);
      response.writeHead(404);
      response.end('File not found');
    } else {
      console.error(`Error serving config file ${pathname}:`, e);
      response.writeHead(500);
      response.end('Internal server error');
    }
  }
}

// Handle image requests (original functionality)
async function handleImageRequest(url, request, response) {
  // Check the page number
  const pageNumberStr = url.pathname;
  // and get the battery level, if any
  // (see https://github.com/sibbl/hass-lovelace-kindle-screensaver/README.md for patch to generate it on Kindle)
  const batteryLevel = parseInt(url.searchParams.get("batteryLevel"));
  const isCharging = url.searchParams.get("isCharging");
  const pageNumber =
    pageNumberStr === "/" ? 1 : parseInt(pageNumberStr.substring(1));
  if (
    isFinite(pageNumber) === false ||
    pageNumber > config.pages.length ||
    pageNumber < 1
  ) {
    console.log(`Invalid request: ${request.url} for page ${pageNumber}`);
    response.writeHead(400);
    response.end("Invalid request");
    return;
  }
  try {
    // Log when the page was accessed
    const n = new Date();
    console.log(`${n.toISOString()}: Image ${pageNumber} was accessed`);

    const pageIndex = pageNumber - 1;
    const configPage = config.pages[pageIndex];

    const outputPathWithExtension = configPage.outputPath + "." + configPage.imageFormat
    const data = await fs.readFile(outputPathWithExtension);
    const stat = await fs.stat(outputPathWithExtension);

    const lastModifiedTime = new Date(stat.mtime).toUTCString();

    response.writeHead(200, {
      "Content-Type": "image/" + configPage.imageFormat,
      "Content-Length": Buffer.byteLength(data),
      "Last-Modified": lastModifiedTime
    });
    response.end(data);

    let pageBatteryStore = batteryStore[pageIndex];
    if (!pageBatteryStore) {
      pageBatteryStore = batteryStore[pageIndex] = {
        batteryLevel: null,
        isCharging: false
      };
    }
    if (!isNaN(batteryLevel) && batteryLevel >= 0 && batteryLevel <= 100) {
      if (batteryLevel !== pageBatteryStore.batteryLevel) {
        pageBatteryStore.batteryLevel = batteryLevel;
        console.log(
          `New battery level: ${batteryLevel} for page ${pageNumber}`
        );
      }

      if (
        (isCharging === "Yes" || isCharging === "1") &&
        pageBatteryStore.isCharging !== true) {
        pageBatteryStore.isCharging = true;
        console.log(`Battery started charging for page ${pageNumber}`);
      } else if (
        (isCharging === "No" || isCharging === "0") &&
        pageBatteryStore.isCharging !== false
      ) {
        console.log(`Battery stopped charging for page ${pageNumber}`);
        pageBatteryStore.isCharging = false;
      }
    }
  } catch (e) {
    console.error(e);
    response.writeHead(404);
    response.end("Image not found");
  }
}

// Determine content type based on file extension
function getContentType(ext) {
  const contentTypes = {
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.sh': 'text/plain',
    '.conf': 'text/plain',
    '.ini': 'text/plain',
    '.cfg': 'text/plain',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml'
  };

  return contentTypes[ext] || 'application/octet-stream';
}

async function launchBrowserAndLogin() {
  console.log("Starting browser...");
  // Log /tmp usage before launch
  try {
    const { execSync } = require('child_process');
    console.log(`[DIAG] /tmp usage before launch:\n${execSync('df -h /tmp && echo "---" && du -sh /tmp/* 2>/dev/null || true').toString()}`);
  } catch (_) {}

  const browser = await puppeteer.launch({
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=TranslateUI",
      "--disable-ipc-flooding-protection",
      "--no-first-run",
      "--no-default-browser-check",
      `--lang=${config.language}`,
      config.ignoreCertificateErrors && "--ignore-certificate-errors"
    ].filter((x) => x),
    dumpio: true,
    defaultViewport: null,
    timeout: config.browserLaunchTimeout,
    headless: config.debug !== true
  });

  const version = await browser.version();
  console.log(`[DIAG] Browser version: ${version}`);
  const chromeProc = browser.process();
  if (chromeProc) {
    chromeProc.on('exit', (code, signal) => console.error(`[DIAG] Chrome exited: code=${code} signal=${signal}`));
  }
  browser.on('disconnected', () => console.error('[DIAG] Browser disconnected!'));

  console.log(`Visiting '${config.baseUrl}' to login...`);
  const page = await browser.newPage();
  await page.goto(config.baseUrl, {
    waitUntil: ["domcontentloaded", "load", "networkidle2"],
    timeout: config.renderingTimeout
  });

  const hassTokens = {
    hassUrl: config.baseUrl,
    access_token: config.accessToken,
    token_type: "Bearer"
  };

  console.log("Adding authentication entry to browser's local storage...");

  // HA may redirect after load, so retry if execution context is destroyed
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.evaluate(
        (hassTokens, selectedLanguage, selectedTheme) => {
          localStorage.setItem("hassTokens", hassTokens);
          localStorage.setItem("selectedLanguage", selectedLanguage);
          localStorage.setItem("selectedTheme", selectedTheme);
        },
        JSON.stringify(hassTokens),
        JSON.stringify(config.language),
        JSON.stringify(config.theme)
      );
      break;
    } catch (e) {
      if (attempt < 3) {
        console.log(`localStorage setup interrupted by navigation (attempt ${attempt}), waiting for page to settle...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: config.renderingTimeout }).catch(() => {});
      } else {
        throw e;
      }
    }
  }

  await page.close();
  return browser;
}

async function renderAndConvertAsync(existingBrowser) {
  const browser = existingBrowser || await launchBrowserAndLogin();
  try {
    for (let pageIndex = 0; pageIndex < config.pages.length; pageIndex++) {
      const pageConfig = config.pages[pageIndex];
      const pageBatteryStore = batteryStore[pageIndex];

      const url = `${config.baseUrl}${pageConfig.screenShotUrl}`;

      const outputPath = pageConfig.outputPath + "." + pageConfig.imageFormat;
      await fsExtra.ensureDir(path.dirname(outputPath));

      const tempPath = outputPath + ".temp";

      console.log(`Rendering ${url} to image...`);
      await renderUrlToImageAsync(browser, pageConfig, url, tempPath);

      // Check if the temp file was actually created before trying to convert it
      try {
        await fs.access(tempPath);
        console.log(`Converting rendered screenshot of ${url} to grayscale...`);
        await convertImageToKindleCompatiblePngAsync(
          pageConfig,
          tempPath,
          outputPath
        );
        fs.unlink(tempPath);
        console.log(`Finished ${url}`);
      } catch (e) {
        console.error(`Failed for ${url}: ${e.message}`);
        try {
          await fs.unlink(tempPath);
        } catch (unlinkError) {
          // Ignore error if file doesn't exist
        }
      }

      if (
        pageBatteryStore &&
        pageBatteryStore.batteryLevel !== null &&
        pageConfig.batteryWebHook
      ) {
        sendBatteryLevelToHomeAssistant(
          pageIndex,
          pageBatteryStore,
          pageConfig.batteryWebHook
        );
      }
    }
  } finally {
    if (!existingBrowser) {
      const proc = browser.process();
      try { await browser.close(); } catch (_) {}
      // Ensure Chrome process tree is fully dead — browser.close() can leave zombies
      if (proc && !proc.killed) {
        proc.kill('SIGKILL');
      }
      // Clean all Chrome temp files from /tmp so the next cycle starts fresh
      try {
        const tmpFiles = await fs.readdir('/tmp');
        for (const f of tmpFiles) {
          await fsExtra.remove(path.join('/tmp', f)).catch(() => {});
        }
      } catch (_) {}
    }
  }
}

function sendBatteryLevelToHomeAssistant(
  pageIndex,
  batteryStore,
  batteryWebHook
) {
  const batteryStatus = JSON.stringify(batteryStore);
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(batteryStatus)
    },
    rejectUnauthorized: !config.ignoreCertificateErrors
  };
  const url = `${config.baseUrl}/api/webhook/${batteryWebHook}`;
  const httpLib = url.toLowerCase().startsWith("https") ? https : http;
  const req = httpLib.request(url, options, (res) => {
    if (res.statusCode !== 200) {
      console.error(
        `Update device ${pageIndex} at ${url} status ${res.statusCode}: ${res.statusMessage}`
      );
    }
  });
  req.on("error", (e) => {
    console.error(`Update ${pageIndex} at ${url} error: ${e.message}`);
  });
  req.write(batteryStatus);
  req.end();
}

async function renderUrlToImageAsync(browser, pageConfig, url, path) {
  let page;
  try {
    page = await browser.newPage();

    page.on('error', err => console.error(`[DIAG] Page crashed: ${err.message}`));
    page.on('close', () => console.warn('[DIAG] Page was closed'));
    page.on('requestfailed', request => console.warn(`[DIAG] Request failed: ${request.url()} - ${request.failure()?.errorText}`));

    // Log /tmp and memory usage before navigation
    try {
      const { execSync } = require('child_process');
      console.log(`[DIAG] /tmp before nav:\n${execSync('df -h /tmp 2>/dev/null || true').toString()}`);
      console.log(`[DIAG] Memory:\n${execSync('free -m 2>/dev/null || cat /proc/meminfo 2>/dev/null | head -5 || true').toString()}`);
    } catch (_) {}

    // Add console logging in debug mode
    if (config.debug) {
      page.on('console', msg => console.log(`[BROWSER] ${msg.type().toUpperCase()}: ${msg.text()}`));
      page.on('pageerror', err => console.error(`[PAGE ERROR] ${err.message}`));
      page.on('requestfailed', request => console.warn(`[REQUEST FAILED] ${request.url()}: ${request.failure().errorText}`));
      console.log(`[DEBUG] Browser viewport will be: ${pageConfig.renderingScreenSize.width}x${pageConfig.renderingScreenSize.height}`);
      console.log(`[DEBUG] Timezone: ${config.timezone}, Language: ${config.language}`);
    }

    await page.emulateTimezone(config.timezone);

    await page.emulateMediaFeatures([
      {
        name: "prefers-color-scheme",
        value: `${pageConfig.prefersColorScheme}`
      }
    ]);

    let size = {
      width: Number(pageConfig.renderingScreenSize.width),
      height: Number(pageConfig.renderingScreenSize.height)
    };

    if (pageConfig.rotation % 180 > 0) {
      size = {
        width: size.height,
        height: size.width
      };
    }

    await page.setViewport(size);

    console.log(`Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: ["domcontentloaded", "load", "networkidle2"],
      timeout: config.renderingTimeout
    });

    console.log(`Waiting for home-assistant element...`);
    await page.waitForSelector("home-assistant", {
      timeout: config.renderingTimeout
    });

    // In debug mode, show additional page information
    if (config.debug) {
      const pageInfo = await page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          userAgent: navigator.userAgent,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          hasHomeAssistant: !!document.querySelector('home-assistant'),
          hasLovelace: !!document.querySelector('hui-view, hui-panel-view'),
          themeInfo: {
            selectedTheme: localStorage.getItem('selectedTheme'),
            hasTokens: !!localStorage.getItem('hassTokens')
          }
        };
      });
      console.log(`[DEBUG] Page info:`, JSON.stringify(pageInfo, null, 2));
    }

    await page.addStyleTag({
      content: `
        body {
          zoom: ${pageConfig.scaling * 100}%;
          overflow: hidden;
        }`
    });

    if (pageConfig.renderingDelay > 0) {
      console.log(`Waiting ${pageConfig.renderingDelay}ms before screenshot...`);
      await new Promise(resolve => setTimeout(resolve, pageConfig.renderingDelay));
    }

    console.log(`Taking screenshot...`);
    await page.screenshot({
      path,
      type: 'png',
      captureBeyondViewport: false,
      clip: {
        x: 0,
        y: 0,
        ...size
      }
    });

    console.log(`Successfully rendered screenshot for ${url}`);
  } catch (e) {
    console.error(`Failed to render ${url}:`, e.message);
  } finally {
    if (config.debug === false && page) {
      try {
        await page.close();
      } catch (closeErr) {
        console.warn(`Could not close page for ${url}: ${closeErr.message}`);
      }
    }
  }
}

async function convertImageToKindleCompatiblePngAsync(
  pageConfig,
  inputPath,
  outputPath
) {
  let image = sharp(inputPath);

  if (pageConfig.removeGamma) {
    image = image.gamma(1.0 / 2.2);
  }

  const rotation = Number(pageConfig.rotation);
  if (rotation !== 0) {
    image = image.rotate(rotation, { background: '#ffffff' });
  }

  if (pageConfig.colorMode === 'GrayScale' || pageConfig.colorMode === 'Grayscale') {
    image = image.grayscale();
  }

  if (pageConfig.saturation !== 1) {
    image = image.modulate({ saturation: pageConfig.saturation });
  }

  if (pageConfig.contrast !== 1) {
    image = image.linear(pageConfig.contrast, -(128 * pageConfig.contrast) + 128);
  }

  if (pageConfig.blackLevel !== '0%' || pageConfig.whiteLevel !== '100%') {
    const blackLevel = parseInt(pageConfig.blackLevel) / 100;
    const whiteLevel = parseInt(pageConfig.whiteLevel) / 100;
    if (blackLevel > 0 || whiteLevel < 1) {
      const inputMin = Math.round(blackLevel * 255);
      const inputMax = Math.round(whiteLevel * 255);
      const multiplier = 255 / (inputMax - inputMin);
      const offset = -inputMin * multiplier;
      image = image.linear(multiplier, offset);
    }
  }

  if (pageConfig.dither) {
    image = image.sharpen({ sigma: 0.5 });
  }

  if (pageConfig.colorMode === 'GrayScale' || pageConfig.colorMode === 'Grayscale') {
    image = image.toColorspace('b-w').png({ compressionLevel: 9, palette: false });
  } else {
    image = image.png({ compressionLevel: 9 });
  }

  await image.toFile(outputPath);
}
