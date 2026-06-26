import crypto from "crypto";
import { promises as fs } from "fs";
import http, {
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse
} from "http";
import { CronJob } from "cron";
import type { Browser } from "puppeteer";
import { updateBatteryStore } from "./battery-store";
import { BrowserManager } from "./browser-manager";
import { shouldReturnNotModified } from "./http-cache";
import { resolveOutputPath } from "./image-output";
import { RenderCoordinator } from "./render-coordinator";
import {
  getHealthcheckMaxAge,
  getRenderJobTimeout,
  renderAndConvertAsync,
  renderPageAndConvertAsync
} from "./rendering";
import type { AppConfig, BatteryStore, RenderResult } from "./types";
import {
  getOperationHeaders,
  hasTruthyFlag,
  isRenderFailure,
  parseRenderTarget
} from "./http-utils";

export interface RunningApp {
  readonly server: Server;
}

export async function startApp(config: AppConfig): Promise<RunningApp | null> {
  if (!validateConfig(config)) {
    return null;
  }

  console.log("Starting HTTP server...");

  const batteryStore: BatteryStore = {};
  const appStartedAt = Date.now();
  let lastSuccessfulRenderAt: number | null = null;
  const browserManager = new BrowserManager(config);
  const renderJobTimeout = getRenderJobTimeout(config);
  const healthcheckMaxAge = getHealthcheckMaxAge(config, renderJobTimeout);
  const rendererDependencies = { config, batteryStore };
  const renderCoordinator = new RenderCoordinator<Browser>({
    renderJobTimeout,
    ensureBrowser: (options) => browserManager.ensureBrowser(options),
    closeBrowser: (reason) => browserManager.closeBrowser(reason),
    onSuccess: () => {
      lastSuccessfulRenderAt = Date.now();
    }
  });

  const safeRender = (): Promise<RenderResult> => {
    return renderCoordinator.run(
      "scheduled render job",
      (currentBrowser, renderContext) =>
        renderAndConvertAsync(
          currentBrowser,
          renderContext,
          rendererDependencies
        ),
      { skipIfBusy: true }
    );
  };

  const requestRender = (
    pageNumber: number | null,
    options: { readonly resetBrowserCache: boolean }
  ): Promise<RenderResult> => {
    if (pageNumber !== null) {
      const pageIndex = pageNumber - 1;
      return renderCoordinator.run(
        `requested render for image ${pageNumber}`,
        (currentBrowser, renderContext) =>
          renderPageAndConvertAsync(
            currentBrowser,
            pageIndex,
            renderContext,
            rendererDependencies
          ),
        {
          resetBrowserCache: options.resetBrowserCache,
          updateLastSuccessfulRender: false
        }
      );
    }

    return renderCoordinator.run(
      "requested render for all images",
      (currentBrowser, renderContext) =>
        renderAndConvertAsync(currentBrowser, renderContext, rendererDependencies),
      { resetBrowserCache: options.resetBrowserCache }
    );
  };

  const clearBrowserCache = (): Promise<RenderResult> => {
    return renderCoordinator.run(
      "browser cache clear",
      async () => {},
      {
        resetBrowserCache: true,
        updateLastSuccessfulRender: false
      }
    );
  };

  const requireAuth = Boolean(config.httpAuthUser && config.httpAuthPassword);
  if (requireAuth) {
    console.log("Basic auth enabled for HTTP server");
  }

  const server = http.createServer(async (request, response) => {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "localhost"}`
    );

    if (url.pathname === "/health") {
      writeHealthResponse({
        response,
        appStartedAt,
        lastSuccessfulRenderAt,
        healthcheckMaxAge,
        renderState: renderCoordinator.getState()
      });
      return;
    }

    if (requireAuth && !isAuthorized(config, request)) {
      response.writeHead(401, {
        "WWW-Authenticate": 'Basic realm="hass-lovelace-kindle-screensaver"'
      });
      response.end("Unauthorized");
      return;
    }

    if (url.pathname === "/render" || url.pathname.startsWith("/render/")) {
      await handleRenderRequest({
        config,
        url,
        request,
        response,
        requestRender
      });
      return;
    }

    if (url.pathname === "/cache/clear") {
      await handleCacheClearRequest({ request, response, clearBrowserCache });
      return;
    }

    await handleImageRequest({
      config,
      batteryStore,
      url,
      request,
      response,
      requestRender,
      clearBrowserCache
    });
  });

  server.listen(config.port, () => {
    console.log(`Server is running at ${config.port}`);
  });

  startRendering(config, browserManager, safeRender).catch((error) => {
    console.error("Rendering startup failed:", error);
  });

  return { server };
}

function validateConfig(config: AppConfig): boolean {
  if (config.pages.length === 0) {
    console.error("Please check your configuration");
    return false;
  }

  if (!config.baseUrl || config.baseUrl.trim() === "") {
    console.error("ERROR: HA_BASE_URL is not configured.");
    console.error("Please set HA_BASE_URL to your Home Assistant instance URL.");
    console.error(
      "Example: https://homeassistant.local:8123 or http://192.168.1.100:8123"
    );
    return false;
  }

  const placeholderPatterns = [
    "your-path-to-home-assistant",
    "your-hass-instance",
    "your-home-assistant",
    "example.com"
  ] as const;

  const baseUrlLower = config.baseUrl.toLowerCase();
  for (const pattern of placeholderPatterns) {
    if (baseUrlLower.includes(pattern)) {
      console.error(
        `ERROR: HA_BASE_URL contains placeholder text: "${config.baseUrl}"`
      );
      console.error("Please update HA_BASE_URL to your actual Home Assistant instance URL.");
      console.error("Examples:");
      console.error("  - https://homeassistant.local:8123");
      console.error("  - http://192.168.1.100:8123");
      console.error("  - https://my-home.duckdns.org:8123");
      return false;
    }
  }

  if (!config.accessToken || config.accessToken.trim() === "") {
    console.error("ERROR: HA_ACCESS_TOKEN is not configured.");
    console.error("Please create a long-lived access token in Home Assistant:");
    console.error("  1. Go to your Home Assistant profile");
    console.error("  2. Scroll down to 'Long-Lived Access Tokens'");
    console.error("  3. Click 'Create Token'");
    console.error("  4. Copy the token and set it as HA_ACCESS_TOKEN");
    return false;
  }

  for (const [pageIndex, pageConfig] of config.pages.entries()) {
    if (pageConfig.rotation % 90 > 0) {
      console.error(
        `Invalid rotation value for entry ${pageIndex + 1}: ${pageConfig.rotation}`
      );
      return false;
    }
  }

  return true;
}

async function startRendering(
  config: AppConfig,
  browserManager: BrowserManager,
  safeRender: () => Promise<RenderResult>
): Promise<void> {
  await browserManager.initBrowser();
  if (config.debug) {
    console.log(
      "Debug mode active, will only render once in non-headless model and keep page open"
    );
    await safeRender();
    return;
  }

  console.log("Starting first render...");
  await safeRender();
  console.log("Starting rendering cronjob...");
  new CronJob({
    cronTime: config.cronJob,
    onTick: () => {
      void safeRender();
    },
    start: true
  });
}

function isAuthorized(config: AppConfig, request: IncomingMessage): boolean {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  const credentials = Buffer.from(authHeader.slice(6), "base64").toString();
  const [user = "", ...passwordParts] = credentials.split(":");
  const password = passwordParts.join(":");
  return user === config.httpAuthUser && password === config.httpAuthPassword;
}

async function handleRenderRequest(options: {
  readonly config: AppConfig;
  readonly url: URL;
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly requestRender: (
    pageNumber: number | null,
    options: { readonly resetBrowserCache: boolean }
  ) => Promise<RenderResult>;
}): Promise<void> {
  if (options.request.method !== "POST") {
    options.response.writeHead(405, { Allow: "POST" });
    options.response.end("Method Not Allowed");
    return;
  }

  const renderTarget = parseRenderTarget(options.url.pathname);
  if (
    renderTarget === null ||
    (renderTarget.pageNumber !== null &&
      renderTarget.pageNumber > options.config.pages.length)
  ) {
    options.response.writeHead(400);
    options.response.end("Invalid render target");
    return;
  }

  const renderResult = await options.requestRender(renderTarget.pageNumber, {
    resetBrowserCache: hasTruthyFlag(options.url.searchParams, "clearCache")
  });
  writeJsonResponse(
    options.response,
    renderResult.status === "ok" ? 200 : 503,
    renderResult
  );
}

async function handleCacheClearRequest(options: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly clearBrowserCache: () => Promise<RenderResult>;
}): Promise<void> {
  if (options.request.method !== "POST") {
    options.response.writeHead(405, { Allow: "POST" });
    options.response.end("Method Not Allowed");
    return;
  }

  const cacheClearResult = await options.clearBrowserCache();
  writeJsonResponse(
    options.response,
    cacheClearResult.status === "ok" ? 200 : 503,
    cacheClearResult
  );
}

async function handleImageRequest(options: {
  readonly config: AppConfig;
  readonly batteryStore: BatteryStore;
  readonly url: URL;
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly requestRender: (
    pageNumber: number | null,
    options: { readonly resetBrowserCache: boolean }
  ) => Promise<RenderResult>;
  readonly clearBrowserCache: () => Promise<RenderResult>;
}): Promise<void> {
  const pageNumber =
    options.url.pathname === "/"
      ? 1
      : Number.parseInt(options.url.pathname.slice(1), 10);

  if (
    !Number.isFinite(pageNumber) ||
    pageNumber > options.config.pages.length ||
    pageNumber < 1
  ) {
    console.log(`Invalid request: ${options.request.url} for page ${pageNumber}`);
    options.response.writeHead(400);
    options.response.end("Invalid request");
    return;
  }

  const pageIndex = pageNumber - 1;
  updateBatteryStore(
    options.batteryStore,
    pageIndex,
    pageNumber,
    Number.parseInt(options.url.searchParams.get("batteryLevel") ?? "", 10),
    options.url.searchParams.get("isCharging")
  );

  const refreshRequested =
    hasTruthyFlag(options.url.searchParams, "refresh") ||
    hasTruthyFlag(options.url.searchParams, "forceRefresh");
  const cacheClearRequested = hasTruthyFlag(options.url.searchParams, "clearCache");

  let renderResult: RenderResult | null = null;
  let cacheClearResult: RenderResult | null = null;
  if (refreshRequested) {
    console.log(`Refresh requested for image ${pageNumber}`);
    renderResult = await options.requestRender(pageNumber, {
      resetBrowserCache: cacheClearRequested
    });
  } else if (cacheClearRequested) {
    console.log("Browser cache clear requested");
    cacheClearResult = await options.clearBrowserCache();
  }

  try {
    const now = new Date();
    console.log(
      `${now.toISOString()}: Image ${pageNumber} was accessed (${options.request.method})`
    );

    const configPage = options.config.pages[pageIndex];
    if (!configPage) {
      throw new Error(`Invalid page index: ${pageIndex}`);
    }

    const outputPathWithExtension = resolveOutputPath(configPage);
    const data = await fs.readFile(outputPathWithExtension);
    const stat = await fs.stat(outputPathWithExtension);

    const lastModifiedTime = new Date(stat.mtime).toUTCString();
    const etag = crypto.createHash("sha256").update(data).digest("hex");
    const quotedEtag = `"${etag}"`;

    const headers: OutgoingHttpHeaders = {
      "Content-Type": `image/${configPage.imageFormat}`,
      "Content-Length": Buffer.byteLength(data),
      "Last-Modified": lastModifiedTime,
      ETag: quotedEtag,
      "Cache-Control": "no-cache",
      ...getOperationHeaders(renderResult, cacheClearResult)
    };

    const operationFailed =
      (renderResult !== null && isRenderFailure(renderResult)) ||
      (cacheClearResult !== null && isRenderFailure(cacheClearResult));
    if (
      !operationFailed &&
      shouldReturnNotModified(options.request.headers, quotedEtag, stat.mtimeMs)
    ) {
      const notModifiedHeaders = { ...headers };
      delete notModifiedHeaders["Content-Length"];
      options.response.writeHead(304, notModifiedHeaders);
      options.response.end();
      return;
    }

    if (options.request.method === "HEAD") {
      options.response.writeHead(200, headers);
      options.response.end();
    } else {
      options.response.writeHead(200, headers);
      options.response.end(data);
    }
  } catch (error) {
    console.error(error);
    options.response.writeHead(
      404,
      getOperationHeaders(renderResult, cacheClearResult)
    );
    options.response.end("Image not found");
  }
}

function writeHealthResponse(options: {
  readonly response: ServerResponse;
  readonly appStartedAt: number;
  readonly lastSuccessfulRenderAt: number | null;
  readonly healthcheckMaxAge: number;
  readonly renderState: {
    readonly renderInProgress: boolean;
    readonly renderInProgressFor: number | null;
  };
}): void {
  const now = Date.now();
  const age =
    options.lastSuccessfulRenderAt === null
      ? null
      : now - options.lastSuccessfulRenderAt;
  const startupAge = now - options.appStartedAt;
  const isHealthy =
    options.lastSuccessfulRenderAt !== null
      ? age !== null && age <= options.healthcheckMaxAge
      : startupAge <= options.healthcheckMaxAge;

  const payload = JSON.stringify({
    status: isHealthy ? "ok" : "stale",
    renderInProgress: options.renderState.renderInProgress,
    renderInProgressFor: options.renderState.renderInProgressFor,
    lastSuccessfulRenderAt:
      options.lastSuccessfulRenderAt === null
        ? null
        : new Date(options.lastSuccessfulRenderAt).toISOString(),
    lastSuccessfulRenderAge: age,
    maxAge: options.healthcheckMaxAge
  });

  options.response.writeHead(isHealthy ? 200 : 503, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-cache"
  });
  options.response.end(payload);
}

function writeJsonResponse(
  response: ServerResponse,
  statusCode: number,
  payload: RenderResult
): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-cache"
  });
  response.end(body);
}
