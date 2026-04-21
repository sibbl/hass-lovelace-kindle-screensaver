import "dotenv/config";
import type { Server } from "node:http";
import { chromium } from "playwright";
import { CronJob } from "cron";
import { loadConfig } from "./config";
import { validateConfig } from "./validate";
import { createHttpServer } from "./server";
import { renderAndConvertAsync } from "./renderer";
import type { BatteryStore } from "./types";

const config = loadConfig();
const batteryStore: BatteryStore = {};

async function startHttpServerAsync(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error): void => {
      server.off("listening", handleListening);
      reject(error);
    };

    const handleListening = (): void => {
      server.off("error", handleError);
      console.log(`Server is running at ${port}`);
      resolve();
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(port);
  });
}

async function closeHttpServerAsync(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function main(): Promise<void> {
  const errors = validateConfig(config);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    return;
  }

  const httpServer = createHttpServer(config, batteryStore);
  await startHttpServerAsync(httpServer, config.port);

  try {
    const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];

    console.log("Starting browser...");
    const browser = await chromium.launch({
      args: [
        "--disable-dev-shm-usage",
        "--no-sandbox",
        `--lang=${config.language}`,
        ...(config.ignoreCertificateErrors ? ["--ignore-certificate-errors"] : []),
      ],
      executablePath: executablePath ?? undefined,
      timeout: config.browserLaunchTimeout,
      headless: config.debug !== true,
    });

    const context = await browser.newContext({
      ignoreHTTPSErrors: config.ignoreCertificateErrors,
    });

    const hassTokens = {
      hassUrl: config.baseUrl,
      access_token: config.accessToken,
      token_type: "Bearer",
    };

    console.log("Adding authentication entry to browser context local storage...");
    await context.addInitScript(
      ([tokensJson, languageJson, themeJson]: readonly [string, string, string | null]) => {
        localStorage.setItem("hassTokens", tokensJson);
        localStorage.setItem("selectedLanguage", languageJson);
        if (themeJson) {
          localStorage.setItem("selectedTheme", themeJson);
        }
      },
      [
        JSON.stringify(hassTokens),
        JSON.stringify(config.language),
        config.theme ? JSON.stringify(config.theme) : null,
      ] as const,
    );

    console.log(`Visiting '${config.baseUrl}' to login...`);
    const page = await context.newPage();
    await page.goto(config.baseUrl ?? "", {
      timeout: config.renderingTimeout,
    });

    await page.close();

    if (config.debug) {
      console.log(
        "Debug mode active, will only render once in non-headless model and keep page open",
      );
      void renderAndConvertAsync(context, config, batteryStore);
    } else {
      console.log("Starting first render...");
      await renderAndConvertAsync(context, config, batteryStore);
      console.log("Starting rendering cronjob...");
      const cronJob = CronJob.from({
        cronTime: config.cronJob,
        onTick: () => {
          void renderAndConvertAsync(context, config, batteryStore);
        },
        start: true,
      });
      console.log(`Cron job started: ${cronJob.isActive ? "running" : "stopped"}`);
    }
  } catch (error: unknown) {
    if (httpServer.listening) {
      await closeHttpServerAsync(httpServer);
    }
    throw error;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
