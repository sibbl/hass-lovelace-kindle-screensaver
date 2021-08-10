const config = require("./config");
const path = require("path");
const http = require("http");
const { promises: fs } = require("fs");
const fsExtra = require("fs-extra");
const puppeteer = require("puppeteer");
const { CronJob } = require("cron");
const gm = require("gm");

// Record of current battery level
var battery = 0;

(async () => {
  if (config.pages.length === 0) {
    return console.error("Please check your configuration");
  }
  for (const i in config.pages) {
    const pageConfig = config.pages[i];
    if (pageConfig.rotation % 90 > 0) {
      return console.error(
        `Invalid rotation value for entry ${i + 1}: ${pageConfig.rotation}`
      );
    }
  }

  console.log("Starting browser...");
  let browser = await puppeteer.launch({
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      `--lang=${config.language}`,
      config.ignoreCertificateErrors && "--ignore-certificate-errors",
    ].filter((x) => x),
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

  const httpServer = http.createServer(async (request, response) => {
    // Parse the request
    const url = new URL(request.url, `http://${request.headers.host}`);
    // Check the page number
    const pageNumberStr = url.pathname;
    // and get the battery level, if any
    // (see https://github.com/sibbl/hass-kindle-screensaver for patch to generate it on Kindle)
    const bttr = url.searchParams.get('battery');
    const pageNumber =
      pageNumberStr === "/" ? 1 : parseInt(pageNumberStr.substr(1));
    if (
      isFinite(pageNumber) === false ||
      pageNumber.length > config.pages.length ||
      pageNumber < 1
    ) {
      console.log("Invalid request: "+request.url);
      console.error("Invalid page requested: " + pageNumber);
      response.writeHead(400);
      response.end("Invalid page");
      return;
    }
    try {
      const data = await fs.readFile(config.pages[pageNumber - 1].outputPath);
      // Log when the page was accessed
      const n = new Date()
      console.log(`${n.toISOString()}: Image ${pageNumber} was accessed`);
      response.setHeader("Content-Length", Buffer.byteLength(data));
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(data);
      if (!isNaN(bttr)) {
        if (bttr != battery) {
            console.log("New battery level: "+bttr);
        }
        battery = bttr;
      } else {
        console.log("No battery level found");
        battery = 0;
      }
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
  for (const pageConfig of config.pages) {
    const url = `${config.baseUrl}${pageConfig.screenShotUrl}`;

    const outputPath = pageConfig.outputPath;
    await fsExtra.ensureDir(path.dirname(outputPath));

    const tempPath = outputPath + ".temp";

//    console.log(`Rendering ${url} to image...`);
    await renderUrlToImageAsync(browser, pageConfig, url, tempPath);

//    console.log(`Converting rendered screenshot of ${url} to grayscale png...`);
    await convertImageToKindleCompatiblePngAsync(
      pageConfig,
      tempPath,
      outputPath
    );

    fs.unlink(tempPath);
//    console.log(`Finished ${url}`);
      if (battery != 0  && config.batteryWebHook) {
	  await updateBatteryLevelinHA(battery);
      }
  }
}

async function updateBatteryLevelinHA(battery) {
    // Let Home Assistant keep track of the battery level
    const lv = JSON.stringify({'level': `${battery}`});
    const ops = { method: 'POST',
		  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(lv) }};
    const burl = `${config.baseUrl}/api/webhook/${config.batteryWebHook}?level=${battery}`;
		 
    const breq = http.request(burl, ops, (res) => {
	if (res.statusCode != 200) {
	    console.error(`Update ${burl} status ${res.statusCode}: ${res.statusMessage}`);
	}
    });
    breq.on('error', (e) => {
	console.error(`Update ${burl} error: ${e.message}`);
    });
    breq.write(lv);
    breq.end();
}

async function renderUrlToImageAsync(browser, pageConfig, url, path) {
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
      width: Number(pageConfig.renderingScreenSize.width),
      height: Number(pageConfig.renderingScreenSize.height),
    };

    if (pageConfig.rotation % 180 > 0) {
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
          width: calc(${size.width}px / ${pageConfig.scaling});
          height: calc(${size.height}px / ${pageConfig.scaling});
          transform-origin: 0 0;
          transform: scale(${pageConfig.scaling});
          overflow: hidden;
        }`,
    });

    if (pageConfig.renderingDelay > 0) {
      await delay(pageConfig.renderingDelay);
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

function convertImageToKindleCompatiblePngAsync(
  pageConfig,
  inputPath,
  outputPath
) {
  return new Promise((resolve, reject) => {
    gm(inputPath)
      .options({
        imageMagick: config.useImageMagick === true,
      })
      .rotate("white", pageConfig.rotation)
      .type("GrayScale")
      .bitdepth(pageConfig.grayscaleDepth)
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
