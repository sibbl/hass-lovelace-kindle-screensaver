import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import fsExtra from "fs-extra";
import gm from "gm";
import type { Browser, Page } from "puppeteer";
import { BatteryManager } from "../battery/battery-manager";
import { HomeAssistantAuth } from "../browser/home-assistant-auth";
import { withTimeout } from "../shared/operation-timeout";
import type { AppConfig, Logger, PageConfig } from "../types";
import {
  getGraphicsMagickFormat,
  resolveFinalTempPath,
  resolveOutputPath,
  resolveScreenshotTempPath,
} from "./image-output";

export class Renderer {
  private readonly config: AppConfig;
  private readonly homeAssistantAuth: HomeAssistantAuth;
  private readonly batteryManager: BatteryManager;
  private readonly logger: Logger;

  public constructor(
    config: AppConfig,
    homeAssistantAuth: HomeAssistantAuth,
    batteryManager: BatteryManager,
    logger: Logger = console,
  ) {
    this.config = config;
    this.homeAssistantAuth = homeAssistantAuth;
    this.batteryManager = batteryManager;
    this.logger = logger;
  }

  public async renderAll(browser: Browser): Promise<void> {
    let failedPages = 0;

    for (let pageIndex = 0; pageIndex < this.config.pages.length; pageIndex += 1) {
      try {
        await this.renderPage(browser, pageIndex);
      } catch (error: unknown) {
        failedPages += 1;
        this.logger.error(`Render failed for page ${pageIndex + 1}:`, error);
      }
    }

    if (failedPages > 0) {
      throw new Error(`${failedPages} render page(s) failed`);
    }
  }

  public async renderPage(browser: Browser, pageIndex: number): Promise<void> {
    const pageConfig = this.config.pages[pageIndex];
    if (!pageConfig) {
      throw new Error(`Unknown render page index ${pageIndex}`);
    }

    const url = `${pageConfig.baseUrl}${pageConfig.screenShotUrl}`;
    const outputPath = resolveOutputPath(pageConfig);
    const tempPath = resolveScreenshotTempPath(outputPath);
    const finalTempPath = resolveFinalTempPath(outputPath, pageConfig.imageFormat);

    try {
      await fsExtra.ensureDir(path.dirname(outputPath));

      this.logger.log(`Rendering ${url} to image...`);
      await this.renderUrlToImage(browser, pageConfig, url, tempPath);

      if (!(await fsExtra.pathExists(tempPath))) {
        throw new Error(`Screenshot missing: ${tempPath}`);
      }

      this.logger.log(`Converting rendered screenshot of ${url} to grayscale...`);
      await withTimeout(
        this.convertImage(pageConfig, tempPath, finalTempPath),
        this.config.renderingTimeout,
        `convert ${url}`,
      );

      const hasChanged = await this.hasImageChanged(finalTempPath, outputPath);
      if (hasChanged) {
        await withTimeout(
          fsExtra.move(finalTempPath, outputPath, { overwrite: true }),
          this.config.renderingTimeout,
          `replace output for ${url}`,
        );
      }

      this.logger.log(`Finished ${url}`);
      this.batteryManager.sendAfterRender(pageIndex, pageConfig);
    } catch (error: unknown) {
      this.logger.error(`Render failed for ${url}, keeping previous image:`, error);
      throw error;
    } finally {
      await fsExtra.remove(tempPath).catch(() => undefined);
      await fsExtra.remove(finalTempPath).catch(() => undefined);
    }
  }

  private async renderUrlToImage(
    browser: Browser,
    pageConfig: PageConfig,
    url: string,
    screenshotPath: string,
  ): Promise<void> {
    let page: Page | undefined;
    try {
      const browserContext = await this.homeAssistantAuth.getAuthenticatedContext(
        browser,
        pageConfig,
        this.config.renderingTimeout,
      );
      page = await withTimeout(
        browserContext.newPage(),
        this.config.renderingTimeout,
        `open browser page for ${url}`,
      );
      await withTimeout(
        page.emulateMediaFeatures([
          {
            name: "prefers-color-scheme",
            value: pageConfig.prefersColorScheme,
          },
        ]),
        this.config.renderingTimeout,
        `emulate media for ${url}`,
      );

      let size = { ...pageConfig.renderingScreenSize };
      if (pageConfig.rotation % 180 > 0) {
        size = {
          width: size.height,
          height: size.width,
        };
      }

      await withTimeout(
        page.setViewport(size),
        this.config.renderingTimeout,
        `set viewport for ${url}`,
      );
      const navigationStartedAt = Date.now();
      this.logger.log(`Navigating to ${url}...`);
      await page.goto(url, {
        waitUntil: ["domcontentloaded", "load", "networkidle0"],
        timeout: this.config.renderingTimeout,
      });

      const navigationDuration = Date.now() - navigationStartedAt;
      this.logger.log(`Waiting for home-assistant root on ${url}...`);
      await page.waitForSelector("home-assistant", {
        timeout: Math.max(this.config.renderingTimeout - navigationDuration, 1000),
      });

      await withTimeout(
        page.addStyleTag({
          content: `
            body {
              zoom: ${pageConfig.scaling * 100}%;
              overflow: hidden;
            }`,
        }),
        this.config.renderingTimeout,
        `add page style for ${url}`,
      );

      if (pageConfig.renderingDelay > 0) {
        await page.waitForTimeout(pageConfig.renderingDelay);
      }
      this.logger.log(`Taking screenshot of ${url}...`);
      await withTimeout(
        page.screenshot({
          path: screenshotPath,
          type: "png",
          captureBeyondViewport: false,
          clip: {
            x: 0,
            y: 0,
            ...size,
          },
        }),
        this.config.renderingTimeout,
        `screenshot ${url}`,
      );
    } catch (error: unknown) {
      this.logger.error(`Failed to render ${url}:`, error);
      throw error;
    } finally {
      if (!this.config.debug && page) {
        await withTimeout(page.close(), 5000, `close browser page for ${url}`).catch(
          (error: unknown) => {
            this.logger.error(`Failed to close browser page for ${url}:`, error);
          },
        );
      }
    }
  }

  private convertImage(
    pageConfig: PageConfig,
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let gmInstance = gm(inputPath)
        .options({
          imageMagick: this.config.useImageMagick,
          timeout: this.config.renderingTimeout,
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

      if (pageConfig.imageFormat.toLowerCase() !== "bmp") {
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

  private async hasImageChanged(finalTempPath: string, outputPath: string): Promise<boolean> {
    if (!(await fsExtra.pathExists(outputPath))) {
      this.logger.log(`First render for ${outputPath}, creating image`);
      return true;
    }

    const [newHash, existingHash] = await Promise.all([
      getFileHash(finalTempPath),
      getFileHash(outputPath),
    ]);
    if (newHash && existingHash && newHash === existingHash) {
      this.logger.log(`Image unchanged for ${outputPath}, skipping update`);
      return false;
    }

    this.logger.log(`Image changed for ${outputPath}, updating`);
    return true;
  }
}

async function getFileHash(filePath: string): Promise<string | null> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  } catch {
    return null;
  }
}
