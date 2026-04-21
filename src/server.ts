import * as http from "node:http";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import type { AppConfig, BatteryStore, BatteryState } from "./types";

const FAVICON_PATH = "/favicon.ico";

export function createHttpServer(config: AppConfig, batteryStore: BatteryStore): http.Server {
  const requireAuth = config.httpAuthUser !== null && config.httpAuthPassword !== null;
  if (requireAuth) {
    console.log("Basic auth enabled for HTTP server");
  }

  const server = http.createServer(
    (request: http.IncomingMessage, response: http.ServerResponse) => {
      void handleRequest(request, response, config, batteryStore, requireAuth);
    },
  );

  return server;
}

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  config: AppConfig,
  batteryStore: BatteryStore,
  requireAuth: boolean,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === FAVICON_PATH) {
    response.writeHead(204);
    response.end();
    return;
  }

  if (requireAuth) {
    if (!checkAuth(request, config, response)) {
      return;
    }
  }

  const pageNumberStr = url.pathname;
  const batteryLevel = Number.parseInt(url.searchParams.get("batteryLevel") ?? "", 10);
  const isCharging = url.searchParams.get("isCharging");
  const pageNumber = pageNumberStr === "/" ? 1 : Number.parseInt(pageNumberStr.substring(1), 10);

  if (!Number.isFinite(pageNumber) || pageNumber > config.pages.length || pageNumber < 1) {
    console.log(`Invalid request: ${request.url} for page ${pageNumber}`);
    response.writeHead(400);
    response.end("Invalid request");
    return;
  }

  try {
    const n = new Date();
    console.log(`${n.toISOString()}: Image ${pageNumber} was accessed (${request.method})`);

    const pageIndex = pageNumber - 1;
    const configPage = config.pages[pageIndex];
    if (!configPage) {
      response.writeHead(400);
      response.end("Invalid request");
      return;
    }

    const outputPathWithExtension = configPage.outputPath + "." + configPage.imageFormat;
    const data = await fs.readFile(outputPathWithExtension);
    const stat = await fs.stat(outputPathWithExtension);

    const lastModifiedTime = new Date(stat.mtime).toUTCString();
    const etag = crypto.createHash("sha256").update(data).digest("hex");

    const headers: Record<string, string | number> = {
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

    updateBatteryStore(batteryStore, pageIndex, pageNumber, batteryLevel, isCharging);
  } catch (e: unknown) {
    console.error(e);
    response.writeHead(404);
    response.end("Image not found");
  }
}

function checkAuth(
  request: http.IncomingMessage,
  config: AppConfig,
  response: http.ServerResponse,
): boolean {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Basic ")) {
    response.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="hass-lovelace-kindle-screensaver"',
    });
    response.end("Unauthorized");
    return false;
  }
  const credentials = Buffer.from(authHeader.slice(6), "base64").toString();
  const [user, ...passwordParts] = credentials.split(":");
  const password = passwordParts.join(":");
  if (user !== config.httpAuthUser || password !== config.httpAuthPassword) {
    response.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="hass-lovelace-kindle-screensaver"',
    });
    response.end("Unauthorized");
    return false;
  }
  return true;
}

function updateBatteryStore(
  batteryStore: BatteryStore,
  pageIndex: number,
  pageNumber: number,
  batteryLevel: number,
  isCharging: string | null,
): void {
  let pageBatteryStore: BatteryState | undefined = batteryStore[pageIndex];
  if (!pageBatteryStore) {
    pageBatteryStore = {
      batteryLevel: null,
      isCharging: false,
    };
    batteryStore[pageIndex] = pageBatteryStore;
  }
  if (!Number.isNaN(batteryLevel) && batteryLevel >= 0 && batteryLevel <= 100) {
    if (batteryLevel !== pageBatteryStore.batteryLevel) {
      pageBatteryStore.batteryLevel = batteryLevel;
      console.log(`New battery level: ${batteryLevel} for page ${pageNumber}`);
    }

    if ((isCharging === "Yes" || isCharging === "1") && pageBatteryStore.isCharging !== true) {
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
}
