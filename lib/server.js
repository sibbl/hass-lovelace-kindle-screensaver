const http = require("http");
const crypto = require("crypto");
const { promises: fs } = require("fs");

function createHttpServer(config, batteryStore) {
  const requireAuth = config.httpAuthUser && config.httpAuthPassword;
  if (requireAuth) {
    console.log("Basic auth enabled for HTTP server");
  }

  const server = http.createServer(async (request, response) => {
    if (requireAuth) {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Basic ")) {
        response.writeHead(401, {
          "WWW-Authenticate":
            'Basic realm="hass-lovelace-kindle-screensaver"',
        });
        response.end("Unauthorized");
        return;
      }
      const credentials = Buffer.from(authHeader.slice(6), "base64").toString();
      const [user, ...passwordParts] = credentials.split(":");
      const password = passwordParts.join(":");
      if (
        user !== config.httpAuthUser ||
        password !== config.httpAuthPassword
      ) {
        response.writeHead(401, {
          "WWW-Authenticate":
            'Basic realm="hass-lovelace-kindle-screensaver"',
        });
        response.end("Unauthorized");
        return;
      }
    }

    const url = new URL(request.url, `http://${request.headers.host}`);
    const pageNumberStr = url.pathname;
    const batteryLevel = parseInt(url.searchParams.get("batteryLevel"));
    const isCharging = url.searchParams.get("isCharging");
    const pageNumber =
      pageNumberStr === "/" ? 1 : parseInt(pageNumberStr.substr(1));

    if (
      isFinite(pageNumber) === false ||
      pageNumber > config.pages.length ||
      pageNumber < 1
    ) {
      console.log(`Invalid request: ${request.url} for page ${pageNumber}`);
      response.writeHead(400);
      response.end("Invalid request");
      return;
    }

    try {
      const n = new Date();
      console.log(
        `${n.toISOString()}: Image ${pageNumber} was accessed (${request.method})`
      );

      const pageIndex = pageNumber - 1;
      const configPage = config.pages[pageIndex];

      const outputPathWithExtension =
        configPage.outputPath + "." + configPage.imageFormat;
      const data = await fs.readFile(outputPathWithExtension);
      const stat = await fs.stat(outputPathWithExtension);

      const lastModifiedTime = new Date(stat.mtime).toUTCString();
      const etag = crypto
        .createHash("sha256")
        .update(data)
        .digest("hex");

      const headers = {
        "Content-Type": "image/" + configPage.imageFormat,
        "Content-Length": Buffer.byteLength(data),
        "Last-Modified": lastModifiedTime,
        ETag: `"${etag}"`,
        "Cache-Control": "no-cache",
      };

      if (request.method === "HEAD") {
        response.writeHead(200, headers);
        response.end();
      } else {
        response.writeHead(200, headers);
        response.end(data);
      }

      let pageBatteryStore = batteryStore[pageIndex];
      if (!pageBatteryStore) {
        pageBatteryStore = batteryStore[pageIndex] = {
          batteryLevel: null,
          isCharging: false,
        };
      }
      if (!isNaN(batteryLevel) && batteryLevel >= 0 && batteryLevel <= 100) {
        if (batteryLevel !== pageBatteryStore.batteryLevel) {
          pageBatteryStore.batteryLevel = batteryLevel;
          console.log(
            `New battery level: ${batteryLevel} for page ${pageNumber}`
          );
        }

        if (
          (isCharging === "Yes" || isCharging === "1") &&
          pageBatteryStore.isCharging !== true
        ) {
          pageBatteryStore.isCharging = true;
          console.log(`Battery started charging for page ${pageNumber}`);
        } else if (
          (isCharging === "No" || isCharging === "0") &&
          pageBatteryStore.isCharging !== false
        ) {
          console.log(`Battery stopped charging for page ${pageNumber}`);
          pageBatteryStore.isCharging = false;
        }
      }
    } catch (e) {
      console.error(e);
      response.writeHead(404);
      response.end("Image not found");
    }
  });

  return server;
}

module.exports = { createHttpServer };
