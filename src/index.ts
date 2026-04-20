import "dotenv/config";
import { chromium } from "playwright";
import { CronJob } from "cron";
import { loadConfig } from "./config";
import { validateConfig } from "./validate";
import { createHttpServer } from "./server";
import { renderAndConvertAsync } from "./renderer";
import type { BatteryStore } from "./types";

const config = loadConfig();
const batteryStore: BatteryStore = {};

async function main(): Promise<void> {
  const errors = validateConfig(config);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    return;
  }

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

  console.log(`Visiting '${config.baseUrl}' to login...`);
  const page = await context.newPage();
  await page.goto(config.baseUrl ?? "", {
    timeout: config.renderingTimeout,
  });

  const hassTokens = {
    hassUrl: config.baseUrl,
    access_token: config.accessToken,
    token_type: "Bearer",
  };

  console.log("Adding authentication entry to browser's local storage...");
  await page.evaluate(
    ([tokensJson, languageJson, themeJson]: [string, string, string | null]) => {
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
    ] as [string, string, string | null],
  );

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
    const cronJob = new CronJob({
      cronTime: config.cronJob,
      onTick: () => {
        void renderAndConvertAsync(context, config, batteryStore);
      },
      start: true,
    });
    console.log(`Cron job started: ${cronJob.running ? "running" : "stopped"}`);
  }

  const httpServer = createHttpServer(config, batteryStore);
  httpServer.listen(config.port, () => {
    console.log(`Server is running at ${config.port}`);
  });
}

void main();
