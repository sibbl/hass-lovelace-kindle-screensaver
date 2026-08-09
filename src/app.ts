import type { Server } from "node:http";
import { CronJob } from "cron";
import type { Browser } from "puppeteer";
import { BatteryManager } from "./battery/battery-manager";
import { BrowserManager } from "./browser/browser-manager";
import { HomeAssistantAuth } from "./browser/home-assistant-auth";
import { validateConfig } from "./config/validate-config";
import { Renderer } from "./rendering/renderer";
import { RenderCoordinator } from "./scheduling/render-coordinator";
import { getHealthcheckMaxAge, getRenderJobTimeout } from "./scheduling/timing";
import { ApplicationHttpServer } from "./server/http-server";
import type { AppConfig, Logger, RenderResult } from "./types";

export interface RunningApplication {
  server: Server;
  browserManager: BrowserManager;
  renderCoordinator: RenderCoordinator<Browser>;
  getCronJob(): CronJob | null;
}

export function startApplication(
  config: AppConfig,
  logger: Logger = console,
): RunningApplication | null {
  const validationErrors = validateConfig(config);
  if (validationErrors.length > 0) {
    for (const error of validationErrors) {
      logger.error(error);
    }
    return null;
  }

  const appStartedAt = Date.now();
  let lastSuccessfulRenderAt: number | null = null;
  let cronJob: CronJob | null = null;
  const browserManager = new BrowserManager(config, logger);
  const homeAssistantAuth = new HomeAssistantAuth(logger);
  const batteryManager = new BatteryManager(config.ignoreCertificateErrors, logger);
  const renderer = new Renderer(config, homeAssistantAuth, batteryManager, logger);
  const renderJobTimeout = getRenderJobTimeout(config);
  const healthcheckMaxAge = getHealthcheckMaxAge(config, renderJobTimeout, logger);
  const renderCoordinator = new RenderCoordinator<Browser>({
    renderJobTimeout,
    ensureBrowser: (options) => browserManager.ensureBrowser(options),
    closeBrowser: (reason) => browserManager.closeCurrentBrowser(reason),
    onSuccess: () => {
      lastSuccessfulRenderAt = Date.now();
    },
    logger,
  });

  const safeRender = (): Promise<RenderResult> =>
    renderCoordinator.run("scheduled render job", (browser) => renderer.renderAll(browser), {
      skipIfBusy: true,
    });
  const requestRender = (
    pageNumber: number | null,
    { resetBrowserCache }: { resetBrowserCache: boolean },
  ): Promise<RenderResult> => {
    if (pageNumber !== null) {
      return renderCoordinator.run(
        `requested render for image ${pageNumber}`,
        (browser) => renderer.renderPage(browser, pageNumber - 1),
        {
          resetBrowserCache,
          updateLastSuccessfulRender: false,
        },
      );
    }

    return renderCoordinator.run(
      "requested render for all images",
      (browser) => renderer.renderAll(browser),
      { resetBrowserCache },
    );
  };
  const clearBrowserCache = (): Promise<RenderResult> =>
    renderCoordinator.run("browser cache clear", async () => undefined, {
      resetBrowserCache: true,
      updateLastSuccessfulRender: false,
    });

  const httpServer = new ApplicationHttpServer({
    config,
    batteryManager,
    healthcheckMaxAge,
    appStartedAt,
    getLastSuccessfulRenderAt: () => lastSuccessfulRenderAt,
    getRenderState: (now) => renderCoordinator.getState(now),
    requestRender,
    clearBrowserCache,
    logger,
  });
  const server = httpServer.start();

  const startRendering = async (): Promise<void> => {
    await browserManager.initialize();
    if (config.debug) {
      logger.log(
        "Debug mode active, will only render once in non-headless model and keep page open",
      );
      await safeRender();
      return;
    }

    logger.log("Starting first render...");
    await safeRender();
    logger.log("Starting rendering cronjob...");
    cronJob = new CronJob({
      cronTime: config.cronJob,
      onTick: () => {
        void safeRender();
      },
      start: true,
    });
  };

  void startRendering().catch((error: unknown) => {
    logger.error("Rendering startup failed:", error);
  });

  return {
    server,
    browserManager,
    renderCoordinator,
    getCronJob: () => cronJob,
  };
}
