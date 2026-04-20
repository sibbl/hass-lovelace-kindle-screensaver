require("dotenv").config();
const puppeteer = require("puppeteer");
const { CronJob } = require("cron");

const { loadConfig } = require("./lib/config");
const { validateConfig } = require("./lib/app");
const { createHttpServer } = require("./lib/server");
const { renderAndConvertAsync } = require("./lib/renderer");

const config = loadConfig();

// keep state of current battery level and whether the device is charging
const batteryStore = {};

(async () => {
  const errors = validateConfig(config);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    return;
  }

  for (const i in config.pages) {
    const pageConfig = config.pages[i];
    if (pageConfig.rotation % 90 > 0) {
      return console.error(
        `Invalid rotation value for entry ${Number(i) + 1}: ${pageConfig.rotation}`
      );
    }
  }

  console.log("Starting browser...");
  let browser = await puppeteer.launch({
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

  console.log(`Visiting '${config.baseUrl}' to login...`);
  let page = await browser.newPage();
  await page.goto(config.baseUrl, {
    timeout: config.renderingTimeout
  });

  const hassTokens = {
    hassUrl: config.baseUrl,
    access_token: config.accessToken,
    token_type: "Bearer"
  };

  console.log("Adding authentication entry to browser's local storage...");
  await page.evaluate(
    (hassTokens, selectedLanguage, selectedTheme) => {
      localStorage.setItem("hassTokens", hassTokens);
      localStorage.setItem("selectedLanguage", selectedLanguage);
      if (selectedTheme) {
        localStorage.setItem("selectedTheme", selectedTheme);
      }
    },
    JSON.stringify(hassTokens),
    JSON.stringify(config.language),
    config.theme ? JSON.stringify(config.theme) : null
  );

  page.close();

  if (config.debug) {
    console.log(
      "Debug mode active, will only render once in non-headless model and keep page open"
    );
    renderAndConvertAsync(browser, config, batteryStore);
  } else {
    console.log("Starting first render...");
    await renderAndConvertAsync(browser, config, batteryStore);
    console.log("Starting rendering cronjob...");
    new CronJob({
      cronTime: config.cronJob,
      onTick: () => renderAndConvertAsync(browser, config, batteryStore),
      start: true
    });
  }

  const httpServer = createHttpServer(config, batteryStore);

  const port = config.port || 5000;
  httpServer.listen(port, () => {
    console.log(`Server is running at ${port}`);
  });
})();
