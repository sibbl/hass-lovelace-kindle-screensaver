import "dotenv/config";
import puppeteer from "puppeteer";
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

  console.log("Starting browser...");
  const browser = await puppeteer.launch({
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      `--lang=${config.language}`,
      ...(config.ignoreCertificateErrors ? ["--ignore-certificate-errors"] : []),
    ],
    defaultViewport: null,
    timeout: config.browserLaunchTimeout,
    headless: config.debug !== true,
  });

  console.log(`Visiting '${config.baseUrl}' to login...`);
  const page = await browser.newPage();
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
    (tokensJson: string, languageJson: string, themeJson: string | null) => {
      localStorage.setItem("hassTokens", tokensJson);
      localStorage.setItem("selectedLanguage", languageJson);
      if (themeJson) {
        localStorage.setItem("selectedTheme", themeJson);
      }
    },
    JSON.stringify(hassTokens),
    JSON.stringify(config.language),
    config.theme ? JSON.stringify(config.theme) : null,
  );

  await page.close();

  if (config.debug) {
    console.log(
      "Debug mode active, will only render once in non-headless model and keep page open",
    );
    void renderAndConvertAsync(browser, config, batteryStore);
  } else {
    console.log("Starting first render...");
    await renderAndConvertAsync(browser, config, batteryStore);
    console.log("Starting rendering cronjob...");
    const cronJob = new CronJob({
      cronTime: config.cronJob,
      onTick: () => {
        void renderAndConvertAsync(browser, config, batteryStore);
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
