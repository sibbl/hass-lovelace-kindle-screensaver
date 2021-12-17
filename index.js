const config = require("./config");
const path = require("path");
const http = require("http");
const { promises: fs } = require("fs");
const fsExtra = require("fs-extra");
const puppeteer = require("puppeteer");
const { CronJob } = require("cron");
const gm = require("gm");

// Record of current battery level and charging state
const batteryStore = { level: 0, charging: 0 };

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

  console.log(`Visiting '${config.baseUrl}' to login...`);
  let page = await browser.newPage();
  await page.goto(config.baseUrl, {
    timeout: config.renderingTimeout,
  });

  const hassTokens = {
    hassUrl: config.baseUrl,
    access_token: config.accessToken,
    token_type: "Bearer",
  };

  console.log("Adding authentication entry to browser's local storage...");
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
    console.log("Starting first render...");
    renderAndConvertAsync(browser);
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
    const level = parseInt(url.searchParams.get('battery'), 10);
    const charging = url.searchParams.get('charging');
    const pageNumber =
      pageNumberStr === "/" ? 1 : parseInt(pageNumberStr.substr(1));
    if (
      isFinite(pageNumber) === false ||
      pageNumber > config.pages.length ||
      pageNumber < 1
    ) {
      console.log("Invalid request: " + request.url + " page " + pageNumber);
      response.writeHead(400);
      response.end("Invalid request");
      return;
    }
    try {
      // Log when the page was accessed
      const n = new Date()
      console.log(`${n.toISOString()}: Image ${pageNumber} was accessed`);

      const data = await fs.readFile(config.pages[pageNumber - 1].outputPath);
      const stat = await fs.stat(config.pages[pageNumber - 1].outputPath);

      const lastModifiedTime = new Date(stat.mtime).toUTCString();

      response.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": Buffer.byteLength(data),
        "Last-Modified": lastModifiedTime,
      });
      response.end(data);
      if (!isNaN(level) && level >= 0) {
        if (level !== batteryStore.level) {
            console.log("New battery level: " + level + " (charging: " + charging + ")");
        }
        batteryStore.level = level;
      } else {
        console.log("No battery level found: " + level);
        batteryStore.level = 0;
      }
      if (charging !== null) {
	  // translate to binary
	if (charging == "Yes") {
	  batteryStore.charging = 1;
        } else if (charging == "No") {
	  batteryStore.charging = 0;
        }
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
      if (batteryStore.level != 0  && config.batteryWebHook) {
	  updateBatteryLevelinHA();
      }
  }
}

function updateBatteryLevelinHA() {
    // Let Home Assistant keep track of the battery level
    const batterystatus = JSON.stringify({'level': `${batteryStore.level}`, 
					  'charging': `${batteryStore.charging}`});
    const options = { method: 'POST',
		      headers: { 'Content-Type': 'application/json', 
				 'Content-Length': Buffer.byteLength(batterystatus) }};
    const baseurl = `${config.baseUrl}/api/webhook/${config.batteryWebHook}?level=${batteryStore.level}&charging=${batteryStore.charging}`;
    const url = new URL(baseurl);
    const prot = url.protocol == 'https' ? https : http;
    const updaterequest = prot.request(baseurl, options, (res) => {
	if (res.statusCode != 200) {
	    console.error(`Update ${baseurl} status ${res.statusCode}: ${res.statusMessage}`);
	}
    });
    updaterequest.on('error', (e) => {
	console.error(`Update ${baseurl} error: ${e.message}`);
    });
    updaterequest.write(batterystatus);
    updaterequest.end();
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
    const startTime = new Date().valueOf();
    await page.goto(url, {
      waitUntil: ["domcontentloaded", "load", "networkidle0"],
      timeout: config.renderingTimeout,
    });

    const navigateTimespan = new Date().valueOf() - startTime;
    await page.waitForSelector("home-assistant", {
      timeout: Math.max(config.renderingTimeout - navigateTimespan, 1000),
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
      await page.waitForTimeout(pageConfig.renderingDelay);
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
      .dither(pageConfig.dither)
      .rotate("white", pageConfig.rotation)
      .type(pageConfig.colorMode)
      .bitdepth(pageConfig.grayscaleDepth)
      .quality(100)
      .write(outputPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
  });
}
