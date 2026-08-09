import { promises as fs } from "node:fs";
import http, { type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatteryManager } from "../../src/battery/battery-manager";
import { ApplicationHttpServer } from "../../src/server/http-server";
import type { AppConfig, RenderResult } from "../../src/types";
import { createAppConfig, createPageConfig } from "../fixtures";

interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

function request(
  server: Server,
  requestPath: string,
  options: { method?: string; headers?: http.OutgoingHttpHeaders } = {},
): Promise<HttpResponse> {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server is not listening on a TCP port");
  }

  return new Promise((resolve, reject) => {
    const clientRequest = http.request(
      {
        host: "127.0.0.1",
        port: address.port,
        path: requestPath,
        method: options.method ?? "GET",
        headers: options.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    clientRequest.on("error", reject);
    clientRequest.end();
  });
}

describe("application HTTP server", () => {
  let tempDirectory: string;
  let server: Server | undefined;
  let config: AppConfig;
  let requestRender: (
    pageNumber: number | null,
    options: { resetBrowserCache: boolean },
  ) => Promise<RenderResult>;
  let clearBrowserCache: () => Promise<RenderResult>;

  beforeEach(async () => {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "kindle-server-"));
    config = createAppConfig({
      port: 0,
      pages: [createPageConfig({ outputPath: path.join(tempDirectory, "cover") })],
    });
    requestRender = vi.fn(async (): Promise<RenderResult> => ({ status: "ok" }));
    clearBrowserCache = vi.fn(async (): Promise<RenderResult> => ({ status: "ok" }));
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
      server = undefined;
    }
    await fs.rm(tempDirectory, { recursive: true, force: true });
  });

  async function startServer(customConfig: AppConfig = config): Promise<Server> {
    const applicationServer = new ApplicationHttpServer({
      config: customConfig,
      batteryManager: new BatteryManager(false, {
        log: vi.fn(),
        error: vi.fn(),
      }),
      healthcheckMaxAge: 60000,
      appStartedAt: Date.now(),
      getLastSuccessfulRenderAt: () => null,
      getRenderState: () => ({
        renderInProgress: false,
        renderInProgressFor: null,
      }),
      requestRender,
      clearBrowserCache,
      logger: { log: vi.fn(), error: vi.fn() },
    });
    server = applicationServer.start();
    if (!server.listening) {
      await once(server, "listening");
    }
    return server;
  }

  it("serves health before image-endpoint authentication", async () => {
    const authenticatedConfig = {
      ...config,
      pages: [
        createPageConfig({
          outputPath: path.join(tempDirectory, "cover"),
          httpAuthUser: "admin",
          httpAuthPassword: "secret",
        }),
      ],
    };
    const runningServer = await startServer(authenticatedConfig);

    const health = await request(runningServer, "/health");
    const image = await request(runningServer, "/");

    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.body.toString())).toMatchObject({ status: "ok" });
    expect(image.statusCode).toBe(401);
    expect(image.headers["www-authenticate"]).toContain("Basic");
  });

  it("applies numbered credentials to matching image and render endpoints", async () => {
    await fs.writeFile(path.join(tempDirectory, "cover.png"), "first-image");
    await fs.writeFile(path.join(tempDirectory, "cover_2.png"), "second-image");
    const authenticatedConfig = {
      ...config,
      pages: [
        createPageConfig({
          outputPath: path.join(tempDirectory, "cover"),
          httpAuthUser: "first-user",
          httpAuthPassword: "first-password",
        }),
        createPageConfig({
          outputPath: path.join(tempDirectory, "cover_2"),
          httpAuthUser: "second-user",
          httpAuthPassword: "second-password",
        }),
      ],
    };
    const runningServer = await startServer(authenticatedConfig);
    const firstAuth = { Authorization: basicAuth("first-user", "first-password") };
    const secondAuth = { Authorization: basicAuth("second-user", "second-password") };

    expect((await request(runningServer, "/", { headers: firstAuth })).statusCode).toBe(200);
    expect((await request(runningServer, "/", { headers: secondAuth })).statusCode).toBe(401);
    expect((await request(runningServer, "/2", { headers: firstAuth })).statusCode).toBe(401);
    expect((await request(runningServer, "/2", { headers: secondAuth })).statusCode).toBe(200);
    expect(
      (await request(runningServer, "/render/2", { method: "POST", headers: firstAuth }))
        .statusCode,
    ).toBe(401);
    expect(
      (await request(runningServer, "/render/2", { method: "POST", headers: secondAuth }))
        .statusCode,
    ).toBe(200);
    expect(requestRender).toHaveBeenCalledWith(2, { resetBrowserCache: false });
  });

  it("serves images with validators and supports conditional requests", async () => {
    await fs.writeFile(path.join(tempDirectory, "cover.png"), "image-data");
    const runningServer = await startServer();

    const first = await request(runningServer, "/");
    const conditional = await request(runningServer, "/", {
      headers: { "If-None-Match": first.headers.etag },
    });
    const head = await request(runningServer, "/", { method: "HEAD" });

    expect(first.statusCode).toBe(200);
    expect(first.body.toString()).toBe("image-data");
    expect(first.headers.etag).toBeTruthy();
    expect(conditional.statusCode).toBe(304);
    expect(conditional.body).toHaveLength(0);
    expect(head.statusCode).toBe(200);
    expect(head.body).toHaveLength(0);
  });

  it("routes on-demand rendering and cache clearing", async () => {
    const runningServer = await startServer();

    const render = await request(runningServer, "/render/1?clearCache=1", {
      method: "POST",
    });
    const clear = await request(runningServer, "/cache/clear", {
      method: "POST",
    });

    expect(render.statusCode).toBe(200);
    expect(requestRender).toHaveBeenCalledWith(1, {
      resetBrowserCache: true,
    });
    expect(clear.statusCode).toBe(200);
    expect(clearBrowserCache).toHaveBeenCalledOnce();
  });

  it("rejects invalid render targets and methods", async () => {
    const runningServer = await startServer();

    expect((await request(runningServer, "/render/2", { method: "POST" })).statusCode).toBe(400);
    expect((await request(runningServer, "/render/1")).statusCode).toBe(405);
  });
});
