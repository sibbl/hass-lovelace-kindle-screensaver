import { parseRequestRoute } from "./request-routing";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import http, {
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import { BatteryManager } from "../battery/battery-manager";
import { resolveOutputPath } from "../rendering/image-output";
import type { AppConfig, Logger, RenderResult, RenderState } from "../types";
import { shouldReturnNotModified } from "./http-cache";
import {
  getHttpAuthForRequest,
  isHttpRequestAuthorized,
  writeUnauthorizedResponse,
} from "./http-auth";
import { getOperationHeaders, hasTruthyFlag, writeJsonResponse } from "./request-helpers";

export interface HttpServerDependencies {
  config: AppConfig;
  batteryManager: BatteryManager;
  healthcheckMaxAge: number;
  appStartedAt: number;
  getLastSuccessfulRenderAt(): number | null;
  getRenderState(now: number): RenderState;
  requestRender(
    pageNumber: number | null,
    options: { resetBrowserCache: boolean },
  ): Promise<RenderResult>;
  clearBrowserCache(): Promise<RenderResult>;
  logger?: Logger;
}

export class ApplicationHttpServer {
  private readonly dependencies: HttpServerDependencies;
  private readonly logger: Logger;
  private server: Server | null = null;

  public constructor(dependencies: HttpServerDependencies) {
    this.dependencies = dependencies;
    this.logger = dependencies.logger ?? console;
  }

  public start(): Server {
    if (this.server) {
      return this.server;
    }

    this.logger.log("Starting HTTP server...");
    if (this.requiresBasicAuth()) {
      this.logger.log("Basic auth enabled for HTTP server");
    }

    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response).catch((error: unknown) => {
        this.logger.error("HTTP request failed:", error);
        if (response.headersSent) {
          response.destroy();
        } else {
          response.writeHead(500);
          response.end("Internal Server Error");
        }
      });
    });
    this.server.listen(this.dependencies.config.port, () => {
      this.logger.log(`Server is running at ${this.dependencies.config.port}`);
    });
    return this.server;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://localhost");
    } catch {
      response.writeHead(400);
      response.end("Invalid request");
      return;
    }
    const route = parseRequestRoute(url.pathname);
    if (
      !route ||
      ("pageNumber" in route &&
        route.pageNumber !== null &&
        route.pageNumber > this.dependencies.config.pages.length)
    ) {
      response.writeHead(400);
      response.end("Invalid request");
      return;
    }

    if (route.type === "health") {
      this.writeHealthResponse(response);
      return;
    }

    if (!this.authorizeRequest(request, response, url.pathname)) {
      return;
    }

    if (route.type === "render") {
      await this.handleRenderRequest(request, response, url, route.pageNumber);
      return;
    }

    if (route.type === "cache") {
      await this.handleCacheClearRequest(request, response);
      return;
    }

    if (route.type === "image")
      await this.handleImageRequest(request, response, url, route.pageNumber);
  }

  private writeHealthResponse(response: ServerResponse): void {
    const now = Date.now();
    const lastSuccessfulRenderAt = this.dependencies.getLastSuccessfulRenderAt();
    const age = lastSuccessfulRenderAt === null ? null : now - lastSuccessfulRenderAt;
    const startupAge = now - this.dependencies.appStartedAt;
    const renderState = this.dependencies.getRenderState(now);
    const isHealthy =
      age === null
        ? startupAge <= this.dependencies.healthcheckMaxAge
        : age <= this.dependencies.healthcheckMaxAge;
    const payload = {
      status: isHealthy ? "ok" : "stale",
      renderInProgress: renderState.renderInProgress,
      renderInProgressFor: renderState.renderInProgressFor,
      lastSuccessfulRenderAt:
        lastSuccessfulRenderAt === null ? null : new Date(lastSuccessfulRenderAt).toISOString(),
      lastSuccessfulRenderAge: age,
      maxAge: this.dependencies.healthcheckMaxAge,
    };

    writeJsonResponse(response, isHealthy ? 200 : 503, payload);
  }

  private authorizeRequest(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): boolean {
    const requestAuth = getHttpAuthForRequest(pathname, this.dependencies.config.pages);
    if (isHttpRequestAuthorized(request.headers.authorization, requestAuth)) {
      return true;
    }

    writeUnauthorizedResponse(response);
    return false;
  }

  private requiresBasicAuth(): boolean {
    return this.dependencies.config.pages.some(
      (pageConfig) => pageConfig.httpAuthUser && pageConfig.httpAuthPassword,
    );
  }
  private async handleRenderRequest(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    pageNumber: number | null,
  ): Promise<void> {
    if (request.method !== "POST") {
      response.writeHead(405, { Allow: "POST" });
      response.end("Method Not Allowed");
      return;
    }

    const renderResult = await this.dependencies.requestRender(pageNumber, {
      resetBrowserCache: hasTruthyFlag(url.searchParams, "clearCache"),
    });
    writeJsonResponse(response, renderResult.status === "ok" ? 200 : 503, renderResult);
  }

  private async handleCacheClearRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== "POST") {
      response.writeHead(405, { Allow: "POST" });
      response.end("Method Not Allowed");
      return;
    }

    const cacheClearResult = await this.dependencies.clearBrowserCache();
    writeJsonResponse(response, cacheClearResult.status === "ok" ? 200 : 503, cacheClearResult);
  }

  private async handleImageRequest(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    pageNumber: number,
  ): Promise<void> {
    const batteryLevel = Number.parseInt(url.searchParams.get("batteryLevel") ?? "", 10);
    const isCharging = url.searchParams.get("isCharging");
    const refreshRequested =
      hasTruthyFlag(url.searchParams, "refresh") || hasTruthyFlag(url.searchParams, "forceRefresh");
    const cacheClearRequested = hasTruthyFlag(url.searchParams, "clearCache");

    const pageIndex = pageNumber - 1;
    this.dependencies.batteryManager.update(pageIndex, pageNumber, batteryLevel, isCharging);

    let renderResult: RenderResult | null = null;
    let cacheClearResult: RenderResult | null = null;
    if (refreshRequested) {
      this.logger.log(`Refresh requested for image ${pageNumber}`);
      renderResult = await this.dependencies.requestRender(pageNumber, {
        resetBrowserCache: cacheClearRequested,
      });
    } else if (cacheClearRequested) {
      this.logger.log("Browser cache clear requested");
      cacheClearResult = await this.dependencies.clearBrowserCache();
    }

    try {
      this.logger.log(
        `${new Date().toISOString()}: Image ${pageNumber} was accessed (${request.method ?? ""})`,
      );
      const pageConfig = this.dependencies.config.pages[pageIndex];
      if (!pageConfig) {
        throw new Error(`Missing configuration for page ${pageNumber}`);
      }

      const outputPath = resolveOutputPath(pageConfig);
      const [data, stat] = await Promise.all([fs.readFile(outputPath), fs.stat(outputPath)]);
      const quotedEtag = `"${crypto.createHash("sha256").update(data).digest("hex")}"`;
      const headers: OutgoingHttpHeaders = {
        "Content-Type": `image/${pageConfig.imageFormat}`,
        "Content-Length": Buffer.byteLength(data),
        "Last-Modified": new Date(stat.mtime).toUTCString(),
        ETag: quotedEtag,
        "Cache-Control": "no-cache",
        ...getOperationHeaders(renderResult, cacheClearResult),
      };
      const operationFailed =
        renderResult?.status === "failed" || cacheClearResult?.status === "failed";

      if (!operationFailed && shouldReturnNotModified(request.headers, quotedEtag, stat.mtimeMs)) {
        const notModifiedHeaders = { ...headers };
        delete notModifiedHeaders["Content-Length"];
        response.writeHead(304, notModifiedHeaders);
        response.end();
        return;
      }

      response.writeHead(200, headers);
      response.end(request.method === "HEAD" ? undefined : data);
    } catch (error: unknown) {
      this.logger.error(error);
      response.writeHead(404, getOperationHeaders(renderResult, cacheClearResult));
      response.end("Image not found");
    }
  }
}
