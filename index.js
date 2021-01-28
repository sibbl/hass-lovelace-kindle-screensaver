const config = require("./config");
const path = require("path");
const http = require("http");
const { promises: fs } = require("fs");
const fsExtra = require("fs-extra");
const puppeteer = require("puppeteer");
const { CronJob } = require("cron");
const gm = require("gm");

(async () => {
  if (config.rotation % 90 > 0) {
    console.error("Invalid rotation value: " + config.rotation);
    return;
  }

  const outputDir = path.dirname(config.outputPath);
  await fsExtra.ensureDir(outputDir);

  console.log("Starting browser...");
  let browser = await puppeteer.launch({
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      `--lang=${config.language}`,
    ],
    headless: config.debug !== true,
  });

  console.log("Adding authentication entry to browser's local storage...");
  let page = await browser.newPage();
  await page.goto(config.baseUrl, {
    timeout: config.renderingTimeout,
  });

  const hassTokens = {
    hassUrl: config.baseUrl,
    access_token: config.accessToken,
    token_type: "Bearer",
  };

  await page.evaluate(
    (hassTokens, selectedLanguage) => {
      localStorage.setItem("hassTokens", hassTokens);
      localStorage.setItem("selectedLanguage", selectedLanguage);
    },
    JSON.stringify(hassTokens),
    JSON.stringify(config.language)
  );

  page.close();

  if (config.debug) {
    console.log(
      "Debug mode active, will only render once in non-headless model and keep page open"
    );
    renderAndConvertAsync(browser);
  } else {
    console.log("Starting rendering cronjob...");
    new CronJob({
      cronTime: config.cronJob,
      onTick: () => renderAndConvertAsync(browser),
      start: true,
    });
  }

  const httpServer = http.createServer(async (_, response) => {
    try {
      const data = await fs.readFile(config.outputPath);
      console.log("Image was accessed");
      response.setHeader("Content-Length", Buffer.byteLength(data));
      response.writeHead(200, { "Content-Type": "image/png" });
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
  let page;
  try {
    page = await browser.newPage();
    await page.emulateMediaFeatures([
      {
        name: "prefers-color-scheme",
        value: "light",
      },
    ]);

    let size = {
      width: Number(config.renderingScreenSize.width),
      height: Number(config.renderingScreenSize.height)
    };

    if (config.rotation % 180 > 0) {
      size = {
        width: size.height,
        height: size.width,
      };
    }

    await page.setViewport(size);
    await page.goto(url, {
      waitUntil: ["domcontentloaded", "load", "networkidle0"],
      timeout: config.renderingTimeout,
    });

    await page.addStyleTag({
      content: `
        body {
          width: calc(${config.renderingScreenSize.width}px / ${config.scaling});
          height: calc(${config.renderingScreenSize.height}px / ${config.scaling});
          transform-origin: 0 0;
          transform: scale(${config.scaling});
          overflow: hidden;
        }`,
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
        ...size,
      },
    });
  } catch (e) {
    console.error("Failed to render", e);
  } finally {
    if (config.debug === false) {
      await page.close();
    }
  }
}

function convertImageToKindleCompatiblePngAsync(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    gm(inputPath)
      .options({
        imageMagick: config.useImageMagick === true,
      })
      .rotate("white", config.rotation)
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
