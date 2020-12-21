const config = require("./config");
const path = require("path");
const http = require("http");
const { promises: fs } = require("fs");
const fsExtra = require("fs-extra");
const puppeteer = require("puppeteer");
const { CronJob } = require("cron");
const gm = require("gm");

(async () => {
  const outputDir = path.dirname(config.outputPath);
  await fsExtra.ensureDir(outputDir);

  console.log("Starting browser...");
  let browser = await puppeteer.launch({
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
    // headless: false,
  });

  console.log("Adding authentication entry to browser's local storage...");
  let page = await browser.newPage();
  await page.goto(config.baseUrl, {
    timeout: config.renderingTimeout,
  });

  const localStorageHassTokens = JSON.stringify({
    hassUrl: config.baseUrl,
    access_token: config.accessToken,
    token_type: "Bearer",
  });

  await page.evaluate((value) => {
    localStorage.setItem("hassTokens", value);
  }, localStorageHassTokens);

  page.close();

  console.log("Starting rendering cronjob...");
  new CronJob({
    cronTime: config.cronJob,
    onTick: () => renderAndConvertAsync(browser),
    start: true,
  });

  // renderAndConvertAsync(browser);

  const httpServer = http.createServer(async (_, response) => {
    try {
      const data = await fs.readFile(config.outputPath);
      response.writeHead(200);
      response.end(data);
    } catch (e) {
      console.error(e);
      response.writeHead(404);
      response.end("Image not found");
    }
  });

  const port = config.port || 5000;
  httpServer.listen(port, () => {
    console.log(`Server is running at ${port}`);
  });
})();

async function renderAndConvertAsync(browser) {
  const url = `${config.baseUrl}${config.screenShotUrl}`;

  const outputPath = config.outputPath;
  const tempPath = outputPath + ".temp";

  console.log(`Rendering ${url} to image...`);
  await renderUrlToImageAsync(browser, url, tempPath);

  console.log(`Converting rendered screenshot of ${url} to grayscale png...`);
  await convertImageToKindleCompatiblePngAsync(tempPath, outputPath);

  fs.unlink(tempPath);
  console.log(`Finished ${url}`);
}

async function renderUrlToImageAsync(browser, url, path) {
  let page = await browser.newPage();
  await page.emulateMediaFeatures([
    {
      name: "prefers-color-scheme",
      value: "light",
    },
  ]);
  await page.setViewport(config.renderingScreenSize);
  await page.goto(url, {
    waitUntil: ["domcontentloaded", "load", "networkidle0"],
    timeout: config.renderingTimeout,
  });
  if (config.renderingDelay > 0) {
    await delay(config.renderingDelay);
  }
  await page.screenshot({
    path,
    type: "png",
    clip: {
      x: 0,
      y: 0,
      ...config.renderingScreenSize,
    },
  });
  await page.close();
}

function convertImageToKindleCompatiblePngAsync(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    gm(inputPath)
      .options({
        imageMagick: config.useImageMagick === true,
      })
      .type("GrayScale")
      .bitdepth(config.grayscaleDepth)
      .write(outputPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
  });
}
function delay(time) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}
