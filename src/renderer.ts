import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as fsExtra from "fs-extra";
import type { BrowserContext } from "playwright";
import { getFileHash } from "./hash";
import { convertImageToKindleCompatiblePngAsync } from "./image";
import { sendBatteryLevelToHomeAssistant } from "./battery";
import type { AppConfig, BatteryStore, PageConfig } from "./types";

export async function renderUrlToImageAsync(
  context: BrowserContext,
  pageConfig: PageConfig,
  url: string,
  outputPath: string,
  renderingTimeout: number,
  debug: boolean,
): Promise<void> {
  let page: import("playwright").Page | undefined;
  try {
    page = await context.newPage();
    await page.emulateMedia({
      colorScheme: pageConfig.prefersColorScheme,
    });

    let size = {
      width: Number(pageConfig.renderingScreenSize.width),
      height: Number(pageConfig.renderingScreenSize.height),
    };

    if (pageConfig.rotation % 180 > 0) {
      size = {
        width: size.height,
        height: size.width,
      };
    }

    await page.setViewportSize(size);
    const startTime = Date.now();
    await page.goto(url, {
      waitUntil: "load",
      timeout: renderingTimeout,
    });

    const navigateTimespan = Date.now() - startTime;
    await page.waitForSelector("home-assistant", {
      timeout: Math.max(renderingTimeout - navigateTimespan, 1000),
    });

    await page.addStyleTag({
      content: `
        body {
          zoom: ${pageConfig.scaling * 100}%;
          overflow: hidden;
        }`,
    });

    if (pageConfig.renderingDelay > 0) {
      await page.waitForTimeout(pageConfig.renderingDelay);
    }
    await page.screenshot({
      path: outputPath,
      type: "png",
      clip: {
        x: 0,
        y: 0,
        ...size,
      },
    });
  } catch (e: unknown) {
    console.error("Failed to render", e);
  } finally {
    if (!debug && page) {
      await page.close();
    }
  }
}

export async function renderAndConvertAsync(
  context: BrowserContext,
  config: AppConfig,
  batteryStore: BatteryStore,
): Promise<void> {
  for (let pageIndex = 0; pageIndex < config.pages.length; pageIndex++) {
    const pageConfig = config.pages[pageIndex];
    if (!pageConfig) continue;

    const pageBatteryStore = batteryStore[pageIndex];

    const url = `${config.baseUrl}${pageConfig.screenShotUrl}`;
    const outputPath = pageConfig.outputPath + "." + pageConfig.imageFormat;
    await fsExtra.ensureDir(path.dirname(outputPath));

    const tempPath = outputPath + ".temp";

    console.log(`Rendering ${url} to image...`);
    await renderUrlToImageAsync(
      context,
      pageConfig,
      url,
      tempPath,
      config.renderingTimeout,
      config.debug,
    );

    if (!(await fsExtra.pathExists(tempPath))) {
      console.error(`Screenshot missing: ${tempPath}`);
      continue;
    }

    console.log(`Converting rendered screenshot of ${url} to grayscale...`);

    const finalTempPath = outputPath + ".final.temp";
    await convertImageToKindleCompatiblePngAsync(
      pageConfig,
      tempPath,
      finalTempPath,
      config.useImageMagick,
    );

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
      await fsExtra.move(finalTempPath, outputPath, { overwrite: true });
    } else {
      await fs.unlink(finalTempPath);
    }

    await fs.unlink(tempPath);
    console.log(`Finished ${url}`);

    if (pageBatteryStore && pageBatteryStore.batteryLevel !== null && pageConfig.batteryWebHook) {
      sendBatteryLevelToHomeAssistant(
        pageIndex,
        pageBatteryStore,
        pageConfig.batteryWebHook,
        config.baseUrl ?? "",
        config.ignoreCertificateErrors,
      );
    }
  }
}
