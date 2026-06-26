import crypto from "crypto";
import { promises as fs } from "fs";
import http from "http";
import https from "https";
import path from "path";
import fsExtra from "fs-extra";
import gmFactory from "gm";
import { CronTime } from "cron";
import type { Browser } from "puppeteer";
import type {
  AppConfig,
  BatteryStore,
  PageConfig,
  RenderContext,
  ScreenSize
} from "./types";
import { getBatteryState } from "./battery-store";
import {
  getGraphicsMagickFormat,
  resolveFinalTempPath,
  resolveOutputPath,
  resolveScreenshotTempPath
} from "./image-output";
import {
  throwIfAborted,
  waitForAbortableTimeout,
  withTimeout
} from "./operation-timeout";

export interface RendererDependencies {
  readonly config: AppConfig;
  readonly batteryStore: BatteryStore;
}

export async function getFileHash(filePath: string): Promise<string | null> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  } catch {
    return null;
  }
}

export async function renderAndConvertAsync(
  browser: Browser,
  renderContext: RenderContext,
  dependencies: RendererDependencies
): Promise<void> {
  let failedPages = 0;

  for (
    let pageIndex = 0;
    pageIndex < dependencies.config.pages.length;
    pageIndex++
  ) {
    throwIfAborted(renderContext.signal, "render job");
    try {
      await renderPageAndConvertAsync(
        browser,
        pageIndex,
        renderContext,
        dependencies
      );
    } catch (error) {
      throwIfAborted(renderContext.signal, "render job");
      failedPages++;
      console.error(`Render failed for page ${pageIndex + 1}:`, error);
    }
  }

  if (failedPages > 0) {
    throw new Error(`${failedPages} render page(s) failed`);
  }
}

export async function renderPageAndConvertAsync(
  browser: Browser,
  pageIndex: number,
  renderContext: RenderContext,
  dependencies: RendererDependencies
): Promise<void> {
  const pageConfig = getPageConfig(dependencies.config, pageIndex);
  const pageBatteryStore = getBatteryState(dependencies.batteryStore, pageIndex);

  const url = `${requiredConfigValue(
    dependencies.config.baseUrl,
    "HA_BASE_URL"
  )}${pageConfig.screenShotUrl}`;
  const outputPath = resolveOutputPath(pageConfig);
  const tempPath = resolveScreenshotTempPath(outputPath);
  const finalTempPath = resolveFinalTempPath(outputPath, pageConfig.imageFormat);

  try {
    throwIfAborted(renderContext.signal, "render page");
    await fsExtra.ensureDir(path.dirname(outputPath));

    console.log(`Rendering ${url} to image...`);
    await renderUrlToImageAsync(
      browser,
      pageConfig,
      url,
      tempPath,
      renderContext,
      dependencies.config
    );
    throwIfAborted(renderContext.signal, "render page");

    if (!(await fsExtra.pathExists(tempPath))) {
      throw new Error(`Screenshot missing: ${tempPath}`);
    }

    console.log(`Converting rendered screenshot of ${url} to grayscale...`);

    await withTimeout(
      convertImageToKindleCompatiblePngAsync(
        dependencies.config,
        pageConfig,
        tempPath,
        finalTempPath
      ),
      dependencies.config.renderingTimeout,
      `convert ${url}`
    );
    throwIfAborted(renderContext.signal, "render page");

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
        dependencies.config.renderingTimeout,
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
        dependencies.config,
        pageIndex,
        pageBatteryStore,
        pageConfig.batteryWebHook
      );
    }
  } catch (error) {
    console.error(`Render failed for ${url}, keeping previous image:`, error);
    throw error;
  } finally {
    await fsExtra.remove(tempPath).catch(() => {});
    await fsExtra.remove(finalTempPath).catch(() => {});
  }
}

export async function renderUrlToImageAsync(
  browser: Browser,
  pageConfig: PageConfig,
  url: string,
  outputPath: string,
  renderContext: RenderContext,
  config: AppConfig
): Promise<void> {
  let page = null as Awaited<ReturnType<Browser["newPage"]>> | null;
  try {
    throwIfAborted(renderContext.signal, `render ${url}`);
    page = await withTimeout(
      browser.newPage(),
      config.renderingTimeout,
      `open browser page for ${url}`
    );
    throwIfAborted(renderContext.signal, `render ${url}`);
    await withTimeout(
      page.emulateMediaFeatures([
        {
          name: "prefers-color-scheme",
          value: pageConfig.prefersColorScheme
        }
      ]),
      config.renderingTimeout,
      `emulate media for ${url}`
    );
    throwIfAborted(renderContext.signal, `render ${url}`);

    const size = getViewportSize(pageConfig);

    await withTimeout(
      page.setViewport(size),
      config.renderingTimeout,
      `set viewport for ${url}`
    );
    throwIfAborted(renderContext.signal, `render ${url}`);

    const startTime = new Date().valueOf();
    console.log(`Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: ["domcontentloaded", "load", "networkidle0"],
      timeout: config.renderingTimeout
    });
    throwIfAborted(renderContext.signal, `render ${url}`);

    const navigateTimespan = new Date().valueOf() - startTime;
    console.log(`Waiting for home-assistant root on ${url}...`);
    await page.waitForSelector("home-assistant", {
      timeout: Math.max(config.renderingTimeout - navigateTimespan, 1000)
    });
    throwIfAborted(renderContext.signal, `render ${url}`);

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
    throwIfAborted(renderContext.signal, `render ${url}`);

    if (pageConfig.renderingDelay > 0) {
      await waitForAbortableTimeout(
        pageConfig.renderingDelay,
        renderContext.signal,
        `rendering delay for ${url}`
      );
    }

    throwIfAborted(renderContext.signal, `render ${url}`);
    console.log(`Taking screenshot of ${url}...`);
    await withTimeout(
      page.screenshot({
        path: outputPath,
        type: "png",
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
  } catch (error) {
    console.error(`Failed to render ${url}:`, error);
    throw error;
  } finally {
    if (config.debug === false && page) {
      await withTimeout(
        page.close(),
        5000,
        `close browser page for ${url}`
      ).catch((error) => {
        console.error(`Failed to close browser page for ${url}:`, error);
      });
    }
  }
}

export function convertImageToKindleCompatiblePngAsync(
  config: AppConfig,
  pageConfig: PageConfig,
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const gm = gmFactory.subClass({
      imageMagick: config.useImageMagick === true,
      timeout: config.renderingTimeout
    });
    const gamma = pageConfig.removeGamma ? 1.0 / 2.2 : 1.0;
    let gmInstance = gm(inputPath)
      .setFormat(getGraphicsMagickFormat(pageConfig.imageFormat))
      .gamma(gamma, gamma, gamma)
      .modulate(100, 100 * pageConfig.saturation)
      .contrast(pageConfig.contrast)
      .dither(pageConfig.dither)
      .rotate("white", pageConfig.rotation)
      .type(pageConfig.colorMode)
      .out("-level", `${pageConfig.blackLevel},${pageConfig.whiteLevel}`)
      .bitdepth(pageConfig.grayscaleDepth);

    if (pageConfig.imageFormat !== "bmp") {
      gmInstance = gmInstance.quality(100);
    }

    gmInstance.strip().write(outputPath, (error: Error | null) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export function sendBatteryLevelToHomeAssistant(
  config: AppConfig,
  pageIndex: number,
  batteryStore: {
    readonly batteryLevel: number | null;
    readonly isCharging: boolean;
  },
  batteryWebHook: string
): void {
  const batteryStatus = JSON.stringify(batteryStore);
  const headers = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(batteryStatus)
  };
  const url = `${requiredConfigValue(
    config.baseUrl,
    "HA_BASE_URL"
  )}/api/webhook/${batteryWebHook}`;

  const request =
    url.toLowerCase().startsWith("https")
      ? https.request(
          url,
          {
            method: "POST",
            headers,
            rejectUnauthorized: !config.ignoreCertificateErrors
          },
          (response) => {
            if (response.statusCode !== 200) {
              console.error(
                `Update device ${pageIndex} at ${url} status ${response.statusCode}: ${response.statusMessage}`
              );
            }
          }
        )
      : http.request(
          url,
          {
            method: "POST",
            headers
          },
          (response) => {
            if (response.statusCode !== 200) {
              console.error(
                `Update device ${pageIndex} at ${url} status ${response.statusCode}: ${response.statusMessage}`
              );
            }
          }
        );

  request.on("error", (error) => {
    console.error(`Update ${pageIndex} at ${url} error: ${error.message}`);
  });
  request.write(batteryStatus);
  request.end();
}

export function getRenderJobTimeout(config: AppConfig): number {
  const pageTimeoutBudget = config.pages.reduce((total, pageConfig) => {
    return total + config.renderingTimeout + pageConfig.renderingDelay + 30000;
  }, 0);

  return Math.max(pageTimeoutBudget, config.renderingTimeout + 30000);
}

export function getHealthcheckMaxAge(
  config: AppConfig,
  renderJobTimeout: number
): number {
  const defaultCronInterval = 60000;

  try {
    const cronTime = new CronTime(config.cronJob);
    const nextDates = cronTime.sendAt(2);
    if (Array.isArray(nextDates)) {
      const firstDate = nextDates[0];
      const secondDate = nextDates[1];
      if (!firstDate || !secondDate) {
        return defaultCronInterval + renderJobTimeout;
      }
      const cronInterval = secondDate.valueOf() - firstDate.valueOf();
      if (Number.isFinite(cronInterval) && cronInterval > 0) {
        return cronInterval + renderJobTimeout;
      }
    }
  } catch (error) {
    console.error("Failed to derive healthcheck age from cron, using fallback:", error);
  }

  return defaultCronInterval + renderJobTimeout;
}

export async function closeBrowser(browser: Browser, reason: string): Promise<void> {
  try {
    await withTimeout(browser.close(), 5000, `close browser after ${reason}`);
  } catch (error) {
    console.error(`Failed to close browser after ${reason}:`, error);
    const browserProcess = browser.process();
    if (browserProcess) {
      browserProcess.kill("SIGKILL");
    }
  }
}

function getViewportSize(pageConfig: PageConfig): ScreenSize {
  const baseSize = {
    width: pageConfig.renderingScreenSize.width,
    height: pageConfig.renderingScreenSize.height
  };

  if (pageConfig.rotation % 180 > 0) {
    return {
      width: baseSize.height,
      height: baseSize.width
    };
  }

  return baseSize;
}

function getPageConfig(config: AppConfig, pageIndex: number): PageConfig {
  const pageConfig = config.pages[pageIndex];
  if (!pageConfig) {
    throw new Error(`Invalid page index: ${pageIndex}`);
  }

  return pageConfig;
}

function requiredConfigValue(
  value: string | undefined,
  environmentVariableName: string
): string {
  if (!value) {
    throw new Error(`${environmentVariableName} is required`);
  }

  return value;
}
