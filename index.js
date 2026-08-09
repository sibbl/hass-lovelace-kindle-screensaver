require("dotenv").config();
const config = require("./config");
const path = require("path");
const http = require("http");
const https = require("https");
const { promises: fs } = require("fs");
const fsExtra = require("fs-extra");
const puppeteer = require("puppeteer");
const { CronJob, CronTime } = require("cron");
const gm = require("gm");
const crypto = require("crypto");
const { shouldReturnNotModified } = require("./http-cache");
const {
  getHttpAuthForRequest,
  isHttpRequestAuthorized,
  writeUnauthorizedResponse
} = require("./http-auth");
const {
  getGraphicsMagickFormat,
  resolveFinalTempPath,
  resolveOutputPath,
  resolveScreenshotTempPath
} = require("./image-output");
const {
  withTimeout
} = require("./operation-timeout");
const { RenderCoordinator } = require("./render-coordinator");
const { getAuthenticatedContext } = require("./home-assistant-auth");

// keep state of current battery level and whether the device is charging
const batteryStore = {};

// Helper function to calculate file hash
async function getFileHash(filePath) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  } catch (error) {
    return null;
  }
}

(async () => {
  if (config.pages.length === 0) {
    return console.error("Please check your configuration");
  }
  
  const placeholderPatterns = [
    'your-path-to-home-assistant',
    'your-hass-instance',
    'your-home-assistant',
    'example.com'
  ];

  for (const [pageIndex, pageConfig] of config.pages.entries()) {
    const suffix = pageIndex === 0 ? "" : `_${pageIndex + 1}`;
    const baseUrlVariable = `HA_BASE_URL${suffix}`;
    const accessTokenVariable = `HA_ACCESS_TOKEN${suffix}`;

    if (!pageConfig.baseUrl || pageConfig.baseUrl.trim() === '') {
      console.error(`ERROR: ${baseUrlVariable} is not configured.`);
      console.error(
        `Please set ${baseUrlVariable} to the Home Assistant instance URL for page ${pageIndex + 1}.`
      );
      return console.error(
        "Example: https://homeassistant.local:8123 or http://192.168.1.100:8123"
      );
    }

    const baseUrlLower = pageConfig.baseUrl.toLowerCase();
    for (const pattern of placeholderPatterns) {
      if (baseUrlLower.includes(pattern)) {
        console.error(
          `ERROR: ${baseUrlVariable} contains placeholder text: "${pageConfig.baseUrl}"`
        );
        console.error(
          `Please update ${baseUrlVariable} to the actual Home Assistant instance URL.`
        );
        console.error("Examples:");
        console.error("  - https://homeassistant.local:8123");
        console.error("  - http://192.168.1.100:8123");
        return console.error("  - https://my-home.duckdns.org:8123");
      }
    }

    if (!pageConfig.accessToken || pageConfig.accessToken.trim() === '') {
      console.error(`ERROR: ${accessTokenVariable} is not configured.`);
      console.error("Please create a long-lived access token in Home Assistant:");
      console.error("  1. Go to your Home Assistant profile");
      console.error("  2. Scroll down to 'Long-Lived Access Tokens'");
      console.error("  3. Click 'Create Token'");
      return console.error(
        `  4. Copy the token and set it as ${accessTokenVariable}`
      );
    }

    if (pageConfig.rotation % 90 > 0) {
      return console.error(
        `Invalid rotation value for entry ${pageIndex + 1}: ${pageConfig.rotation}`
      );
    }
  }

  // --- Start HTTP server IMMEDIATELY (before browser/render setup) ---
  // This ensures the Kindle always gets the last good image,
  // even if HA is temporarily unreachable during startup.
  console.log("Starting HTTP server...");

  let initInProgress = false;
  let browser = null;
  let browserStartedAt = null;
  const appStartedAt = Date.now();
  let lastSuccessfulRenderAt = null;

  const renderJobTimeout = getRenderJobTimeout();
  const healthcheckMaxAge = getHealthcheckMaxAge(renderJobTimeout);

  const closeCurrentBrowser = async (reason) => {
    if (!browser) {
      return;
    }

    const browserToClose = browser;
    browser = null;
    browserStartedAt = null;
    console.error(`Closing browser after ${reason}`);
    await closeBrowser(browserToClose, reason);
  };

  const isBrowserCacheExpired = () => {
    return (
      config.browserCacheTtl > 0 &&
      browserStartedAt !== null &&
      Date.now() - browserStartedAt >= config.browserCacheTtl
    );
  };

  const ensureBrowser = async ({ resetBrowserCache = false } = {}) => {
    if (resetBrowserCache) {
      await closeCurrentBrowser("browser cache reset request");
    } else if (isBrowserCacheExpired()) {
      await closeCurrentBrowser("browser cache TTL expiry");
    }

    if (!browser) {
      await initBrowser();
      if (!browser) {
        throw new Error("Browser not ready after init attempt");
      }
    }

    return browser;
  };

  const renderCoordinator = new RenderCoordinator({
    renderJobTimeout,
    ensureBrowser,
    closeBrowser: closeCurrentBrowser,
    onSuccess: () => {
      lastSuccessfulRenderAt = Date.now();
    }
  });

  const safeRender = () => {
    return renderCoordinator.run(
      "scheduled render job",
      (currentBrowser) => renderAndConvertAsync(currentBrowser),
      { skipIfBusy: true }
    );
  };

  const requestRender = (pageNumber, { resetBrowserCache = false } = {}) => {
    if (pageNumber) {
      const pageIndex = pageNumber - 1;
      return renderCoordinator.run(
        `requested render for image ${pageNumber}`,
        (currentBrowser) => renderPageAndConvertAsync(currentBrowser, pageIndex),
        {
          resetBrowserCache,
          updateLastSuccessfulRender: false
        }
      );
    }

    return renderCoordinator.run(
      "requested render for all images",
      (currentBrowser) => renderAndConvertAsync(currentBrowser),
      { resetBrowserCache }
    );
  };

  const clearBrowserCache = () => {
    return renderCoordinator.run(
      "browser cache clear",
      () => Promise.resolve(),
      {
        resetBrowserCache: true,
        updateLastSuccessfulRender: false
      }
    );
  };

  const hasProtectedPage = config.pages.some(
    (pageConfig) => pageConfig.httpAuthUser && pageConfig.httpAuthPassword
  );
  if (hasProtectedPage) {
    console.log("Basic auth enabled for HTTP server");
  }

  const httpServer = http.createServer(async (request, response) => {
    // Parse the request
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/health") {
      const now = Date.now();
      const age = lastSuccessfulRenderAt ? now - lastSuccessfulRenderAt : null;
      const startupAge = now - appStartedAt;
      const renderState = renderCoordinator.getState(now);
      const isHealthy =
        lastSuccessfulRenderAt !== null
          ? age <= healthcheckMaxAge
          : startupAge <= healthcheckMaxAge;

      const payload = JSON.stringify({
        status: isHealthy ? "ok" : "stale",
        renderInProgress: renderState.renderInProgress,
        renderInProgressFor: renderState.renderInProgressFor,
        lastSuccessfulRenderAt: lastSuccessfulRenderAt
          ? new Date(lastSuccessfulRenderAt).toISOString()
          : null,
        lastSuccessfulRenderAge: age,
        maxAge: healthcheckMaxAge
      });

      response.writeHead(isHealthy ? 200 : 503, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Cache-Control": "no-cache"
      });
      response.end(payload);
      return;
    }

    // Check the credentials configured for the requested page. Global operations
    // such as /render and /cache/clear use the first page's credentials.
    const requestAuth = getHttpAuthForRequest(url.pathname, config.pages);
    if (!isHttpRequestAuthorized(request.headers.authorization, requestAuth)) {
      writeUnauthorizedResponse(response);
      return;
    }

    if (url.pathname === "/render" || url.pathname.startsWith("/render/")) {
      if (request.method !== "POST") {
        response.writeHead(405, { "Allow": "POST" });
        response.end("Method Not Allowed");
        return;
      }

      const renderTarget = parseRenderTarget(url.pathname);
      if (
        renderTarget === null ||
        renderTarget.pageNumber > config.pages.length
      ) {
        response.writeHead(400);
        response.end("Invalid render target");
        return;
      }

      const renderResult = await requestRender(renderTarget.pageNumber, {
        resetBrowserCache: hasTruthyFlag(url.searchParams, "clearCache")
      });
      writeJsonResponse(
        response,
        renderResult.status === "ok" ? 200 : 503,
        renderResult
      );
      return;
    }

    if (url.pathname === "/cache/clear") {
      if (request.method !== "POST") {
        response.writeHead(405, { "Allow": "POST" });
        response.end("Method Not Allowed");
        return;
      }

      const cacheClearResult = await clearBrowserCache();
      writeJsonResponse(
        response,
        cacheClearResult.status === "ok" ? 200 : 503,
        cacheClearResult
      );
      return;
    }

    // Check the page number
    const pageNumberStr = url.pathname;
    // and get the battery level, if any
    // (see https://github.com/sibbl/hass-lovelace-kindle-screensaver/README.md for patch to generate it on Kindle)
    const batteryLevel = parseInt(url.searchParams.get("batteryLevel"));
    const isCharging = url.searchParams.get("isCharging");
    const pageNumber =
      pageNumberStr === "/" ? 1 : parseInt(pageNumberStr.substr(1));
    const refreshRequested =
      hasTruthyFlag(url.searchParams, "refresh") ||
      hasTruthyFlag(url.searchParams, "forceRefresh");
    const cacheClearRequested = hasTruthyFlag(url.searchParams, "clearCache");
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

    const pageIndex = pageNumber - 1;
    updateBatteryStore(pageIndex, pageNumber, batteryLevel, isCharging);

    let renderResult = null;
    let cacheClearResult = null;
    if (refreshRequested) {
      console.log(`Refresh requested for image ${pageNumber}`);
      renderResult = await requestRender(pageNumber, {
        resetBrowserCache: cacheClearRequested
      });
    } else if (cacheClearRequested) {
      console.log("Browser cache clear requested");
      cacheClearResult = await clearBrowserCache();
    }

    try {
      // Log when the page was accessed
      const n = new Date();
      console.log(`${n.toISOString()}: Image ${pageNumber} was accessed (${request.method})`);

      const configPage = config.pages[pageIndex];

      const outputPathWithExtension = resolveOutputPath(configPage);
      const data = await fs.readFile(outputPathWithExtension);
      const stat = await fs.stat(outputPathWithExtension);

      const lastModifiedTime = new Date(stat.mtime).toUTCString();
      const etag = crypto.createHash('sha256').update(data).digest('hex');
      const quotedEtag = `"${etag}"`;

      const headers = {
        "Content-Type": "image/" + configPage.imageFormat,
        "Content-Length": Buffer.byteLength(data),
        "Last-Modified": lastModifiedTime,
        "ETag": quotedEtag,
        "Cache-Control": "no-cache",
        ...getOperationHeaders(renderResult, cacheClearResult)
      };

      const operationFailed =
        (renderResult && renderResult.status === "failed") ||
        (cacheClearResult && cacheClearResult.status === "failed");
      if (
        !operationFailed &&
        shouldReturnNotModified(request.headers, quotedEtag, stat.mtimeMs)
      ) {
        const notModifiedHeaders = { ...headers };
        delete notModifiedHeaders["Content-Length"];
        response.writeHead(304, notModifiedHeaders);
        response.end();
        return;
      }

      // Support HEAD requests — return headers only, no body
      if (request.method === "HEAD") {
        response.writeHead(200, headers);
        response.end();
      } else {
        response.writeHead(200, headers);
        response.end(data);
      }
    } catch (e) {
      console.error(e);
      response.writeHead(404, getOperationHeaders(renderResult, cacheClearResult));
      response.end("Image not found");
    }
  });

  const port = config.port || 5000;
  httpServer.listen(port, () => {
    console.log(`Server is running at ${port}`);
  });

  // --- Initialize browser (non-blocking for HTTP) ---
  // If this fails, the HTTP server keeps serving the last good image.
  const initBrowser = async () => {
    if (browser) {
      return browser;
    }
    if (initInProgress) {
      console.log("Browser init already in progress, skipping init attempt");
      return null;
    }

    initInProgress = true;
    let nextBrowser = null;
    try {
      console.log("Starting browser...");
      nextBrowser = await puppeteer.launch({
        args: [
          "--disable-dev-shm-usage",
          "--no-sandbox",
          `--lang=${config.language}`,
          config.ignoreCertificateErrors && "--ignore-certificate-errors"
        ].filter((x) => x),
        defaultViewport: null,
        timeout: config.browserLaunchTimeout,
        headless: config.debug !== true
      });

      browser = nextBrowser;
      browserStartedAt = Date.now();
      browser.on("disconnected", () => {
        if (browser === nextBrowser) {
          browser = null;
          browserStartedAt = null;
        }
      });
      return browser;
    } catch (err) {
      console.error("Browser startup failed, will retry on next render tick:", err);
      if (nextBrowser) {
        await nextBrowser.close().catch((closeErr) => {
          console.error("Failed to close browser after init failure:", closeErr);
        });
      }
      return null;
    } finally {
      initInProgress = false;
    }
  };

  // --- Now start rendering (HTTP is already serving) ---
  const startRendering = async () => {
    await initBrowser();
    if (config.debug) {
      console.log(
        "Debug mode active, will only render once in non-headless model and keep page open"
      );
      await safeRender();
    } else {
      console.log("Starting first render...");
      await safeRender();
      console.log("Starting rendering cronjob...");
      new CronJob({
        cronTime: config.cronJob,
        onTick: () => safeRender(),
        start: true
      });
    }
  };

  startRendering().catch((err) => {
    console.error("Rendering startup failed:", err);
  });
})();

async function renderAndConvertAsync(browser) {
  let failedPages = 0;

  for (let pageIndex = 0; pageIndex < config.pages.length; pageIndex++) {
    try {
      await renderPageAndConvertAsync(browser, pageIndex);
    } catch (err) {
      failedPages++;
      console.error(`Render failed for page ${pageIndex + 1}:`, err);
    }
  }

  if (failedPages > 0) {
    throw new Error(`${failedPages} render page(s) failed`);
  }
}

async function renderPageAndConvertAsync(browser, pageIndex) {
  const pageConfig = config.pages[pageIndex];
  const pageBatteryStore = batteryStore[pageIndex];

  const url = `${pageConfig.baseUrl}${pageConfig.screenShotUrl}`;
  const outputPath = resolveOutputPath(pageConfig);
  const tempPath = resolveScreenshotTempPath(outputPath);
  const finalTempPath = resolveFinalTempPath(
    outputPath,
    pageConfig.imageFormat
  );

  try {
    await fsExtra.ensureDir(path.dirname(outputPath));

    console.log(`Rendering ${url} to image...`);
    await renderUrlToImageAsync(browser, pageConfig, url, tempPath);

    if (!(await fsExtra.pathExists(tempPath))) {
      throw new Error(`Screenshot missing: ${tempPath}`);
    }

    console.log(`Converting rendered screenshot of ${url} to grayscale...`);

    await withTimeout(
      convertImageToKindleCompatiblePngAsync(
        pageConfig,
        tempPath,
        finalTempPath
      ),
      config.renderingTimeout,
      `convert ${url}`
    );

    // Compare with existing image — only update if changed
    let hasChanged = true;
    if (await fsExtra.pathExists(outputPath)) {
      const newHash = await getFileHash(finalTempPath);
      const existingHash = await getFileHash(outputPath);

      if (newHash && existingHash && newHash === existingHash) {
        hasChanged = false;
        console.log(`Image unchanged for ${url}, skipping update`);
      } else {
        console.log(`Image changed for ${url}, updating`);
      }
    } else {
      console.log(`First render for ${url}, creating image`);
    }

    if (hasChanged) {
      await withTimeout(
        fsExtra.move(finalTempPath, outputPath, { overwrite: true }),
        config.renderingTimeout,
        `replace output for ${url}`
      );
    }

    console.log(`Finished ${url}`);

    if (
      pageBatteryStore &&
      pageBatteryStore.batteryLevel !== null &&
      pageConfig.batteryWebHook
    ) {
      sendBatteryLevelToHomeAssistant(
        pageIndex,
        pageBatteryStore,
        pageConfig.baseUrl,
        pageConfig.batteryWebHook
      );
    }
  } catch (err) {
    console.error(`Render failed for ${url}, keeping previous image:`, err);
    throw err;
  } finally {
    await fsExtra.remove(tempPath).catch(() => {});
    await fsExtra.remove(finalTempPath).catch(() => {});
  }
}

function sendBatteryLevelToHomeAssistant(
  pageIndex,
  batteryStore,
  baseUrl,
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
  const url = `${baseUrl}/api/webhook/${batteryWebHook}`;
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

function updateBatteryStore(pageIndex, pageNumber, batteryLevel, isCharging) {
  let pageBatteryStore = batteryStore[pageIndex];
  if (!pageBatteryStore) {
    pageBatteryStore = batteryStore[pageIndex] = {
      batteryLevel: null,
      isCharging: false
    };
  }

  if (isNaN(batteryLevel) || batteryLevel < 0 || batteryLevel > 100) {
    return;
  }

  if (batteryLevel !== pageBatteryStore.batteryLevel) {
    pageBatteryStore.batteryLevel = batteryLevel;
    console.log(`New battery level: ${batteryLevel} for page ${pageNumber}`);
  }

  if (
    (isCharging === "Yes" || isCharging === "1") &&
    pageBatteryStore.isCharging !== true
  ) {
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

function hasTruthyFlag(searchParams, name) {
  if (!searchParams.has(name)) {
    return false;
  }

  const value = String(searchParams.get(name) || "").toLowerCase();
  return !["0", "false", "no", "off"].includes(value);
}

function parseRenderTarget(pathname) {
  if (pathname === "/render") {
    return { pageNumber: null };
  }

  const match = pathname.match(/^\/render\/(\d+)$/);
  if (!match) {
    return null;
  }

  const pageNumber = parseInt(match[1], 10);
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return null;
  }

  return { pageNumber };
}

function getOperationHeaders(renderResult, cacheClearResult) {
  const headers = {};

  if (renderResult) {
    headers["X-Render-Status"] = renderResult.status;
    if (renderResult.error) {
      headers["X-Render-Error"] = sanitizeHeaderValue(renderResult.error);
    }
  }

  if (cacheClearResult) {
    headers["X-Cache-Clear-Status"] = cacheClearResult.status;
    if (cacheClearResult.error) {
      headers["X-Cache-Clear-Error"] = sanitizeHeaderValue(cacheClearResult.error);
    }
  }

  return headers;
}

function sanitizeHeaderValue(value) {
  return String(value).replace(/[\r\n]/g, " ").slice(0, 256);
}

function writeJsonResponse(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-cache"
  });
  response.end(body);
}

async function renderUrlToImageAsync(browser, pageConfig, url, path) {
  let page;
  try {
    const browserContext = await getAuthenticatedContext(
      browser,
      pageConfig,
      config.renderingTimeout
    );
    page = await withTimeout(
      browserContext.newPage(),
      config.renderingTimeout,
      `open browser page for ${url}`
    );
    await withTimeout(
      page.emulateMediaFeatures([
        {
          name: "prefers-color-scheme",
          value: `${pageConfig.prefersColorScheme}`
        }
      ]),
      config.renderingTimeout,
      `emulate media for ${url}`
    );

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

    await withTimeout(
      page.setViewport(size),
      config.renderingTimeout,
      `set viewport for ${url}`
    );
    const startTime = new Date().valueOf();
    console.log(`Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: ["domcontentloaded", "load", "networkidle0"],
      timeout: config.renderingTimeout
    });

    const navigateTimespan = new Date().valueOf() - startTime;
    console.log(`Waiting for home-assistant root on ${url}...`);
    await page.waitForSelector("home-assistant", {
      timeout: Math.max(config.renderingTimeout - navigateTimespan, 1000)
    });

    await withTimeout(
      page.addStyleTag({
        content: `
          body {
            zoom: ${pageConfig.scaling * 100}%;
            overflow: hidden;
          }`
      }),
      config.renderingTimeout,
      `add page style for ${url}`
    );

    if (pageConfig.renderingDelay > 0) {
      await page.waitForTimeout(pageConfig.renderingDelay);
    }
    console.log(`Taking screenshot of ${url}...`);
    await withTimeout(
      page.screenshot({
        path,
        type: 'png', // Always use PNG for screenshot
        captureBeyondViewport: false,
        clip: {
          x: 0,
          y: 0,
          ...size
        }
      }),
      config.renderingTimeout,
      `screenshot ${url}`
    );
  } catch (e) {
    console.error(`Failed to render ${url}:`, e);
    throw e;
  } finally {
    if (config.debug === false && page) {
      await withTimeout(
        page.close(),
        5000,
        `close browser page for ${url}`
      ).catch((err) => {
        console.error(`Failed to close browser page for ${url}:`, err);
      });
    }
  }
}

function convertImageToKindleCompatiblePngAsync(
  pageConfig,
  inputPath,
  outputPath
) {
  return new Promise((resolve, reject) => {
    let gmInstance = gm(inputPath)
      .options({
        imageMagick: config.useImageMagick === true,
        timeout: config.renderingTimeout
      })
      .setFormat(getGraphicsMagickFormat(pageConfig.imageFormat))
      .gamma(pageConfig.removeGamma ? 1.0 / 2.2 : 1.0)
      .modulate(100, 100 * pageConfig.saturation)
      .contrast(pageConfig.contrast)
      .dither(pageConfig.dither)
      .rotate("white", pageConfig.rotation)
      .type(pageConfig.colorMode)
      .level(pageConfig.blackLevel, pageConfig.whiteLevel)
      .bitdepth(pageConfig.grayscaleDepth);

    // For BMP format, we don't set quality since it's not applicable
    if (pageConfig.imageFormat !== 'bmp') {
      gmInstance = gmInstance.quality(100);
    }

    // Strip metadata to ensure deterministic output for hash comparison
    gmInstance = gmInstance.strip();

    gmInstance.write(outputPath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function getRenderJobTimeout() {
  const pageTimeoutBudget = config.pages.reduce((total, pageConfig) => {
    return (
      total +
      config.renderingTimeout +
      getNumber(pageConfig.renderingDelay, 0) +
      30000
    );
  }, 0);

  return Math.max(pageTimeoutBudget, config.renderingTimeout + 30000);
}

function getHealthcheckMaxAge(renderJobTimeout) {
  const defaultCronInterval = 60000;

  try {
    const cronTime = new CronTime(config.cronJob);
    const nextDates = cronTime.sendAt(2);
    const cronInterval = nextDates[1].valueOf() - nextDates[0].valueOf();

    if (Number.isFinite(cronInterval) && cronInterval > 0) {
      return cronInterval + renderJobTimeout;
    }
  } catch (err) {
    console.error("Failed to derive healthcheck age from cron, using fallback:", err);
  }

  return defaultCronInterval + renderJobTimeout;
}

function getNumber(value, fallbackValue) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallbackValue;
}

async function closeBrowser(browser, reason) {
  try {
    await withTimeout(browser.close(), 5000, `close browser after ${reason}`);
  } catch (err) {
    console.error(`Failed to close browser after ${reason}:`, err);
    const browserProcess = browser.process && browser.process();
    if (browserProcess) {
      browserProcess.kill("SIGKILL");
    }
  }
}
