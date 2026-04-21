import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";
import { createHttpServer } from "../../src/server";

function makeRequest(server, options) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const defaults = {
      hostname: "127.0.0.1",
      port: address.port,
      method: "GET",
      path: "/",
    };
    const opts = { ...defaults, ...options };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function listenOnRandomPort(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(resolve);
  });
}

describe("HTTP Server", () => {
  let tempDir;
  let testImagePath;
  let testImageData;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "server-test-"));
    // Create a simple test PNG (1x1 pixel)
    testImageData = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    testImagePath = path.join(tempDir, "cover.png");
    await fs.writeFile(testImagePath, testImageData);
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function makeConfig(overrides) {
    return {
      pages: [
        {
          outputPath: path.join(tempDir, "cover"),
          imageFormat: "png",
        },
      ],
      httpAuthUser: null,
      httpAuthPassword: null,
      ...overrides,
    };
  }

  describe("basic requests", () => {
    let server;

    beforeEach(async () => {
      if (server) {
        await closeServer(server);
      }
    });

    afterAll(async () => {
      if (server) {
        await closeServer(server);
      }
    });

    it("should serve an image on GET /", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const res = await makeRequest(server, { path: "/" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("image/png");
      expect(res.body.length).toBeGreaterThan(0);
    });

    it("should serve an image on GET /1", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const res = await makeRequest(server, { path: "/1" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("image/png");
    });

    it("should return 400 for invalid page number", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const res = await makeRequest(server, { path: "/99" });
      expect(res.statusCode).toBe(400);
      expect(res.body.toString()).toContain("Invalid request");
    });

    it("should return 400 for page 0", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const res = await makeRequest(server, { path: "/0" });
      expect(res.statusCode).toBe(400);
    });

    it("should return 400 for non-numeric path", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const res = await makeRequest(server, { path: "/abc" });
      expect(res.statusCode).toBe(400);
    });

    it("should ignore favicon requests", async () => {
      const config = makeConfig();
      const batteryStore = {};
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      try {
        server = createHttpServer(config, batteryStore);
        await listenOnRandomPort(server);

        const res = await makeRequest(server, { path: "/favicon.ico" });
        expect(res.statusCode).toBe(204);
        expect(res.body.length).toBe(0);
        expect(Object.keys(batteryStore)).toHaveLength(0);
        expect(consoleLogSpy).not.toHaveBeenCalled();
      } finally {
        consoleLogSpy.mockRestore();
      }
    });

    it("should support HEAD requests", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const res = await makeRequest(server, { path: "/", method: "HEAD" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("image/png");
      expect(res.headers["etag"]).toBeTruthy();
      expect(res.headers["last-modified"]).toBeTruthy();
      expect(res.headers["cache-control"]).toBe("no-cache");
      // HEAD should have no body
      expect(res.body.length).toBe(0);
    });

    it("should include correct headers on GET", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const res = await makeRequest(server, { path: "/" });
      expect(res.headers["content-type"]).toBe("image/png");
      expect(res.headers["etag"]).toMatch(/^"[a-f0-9]{64}"$/);
      expect(res.headers["last-modified"]).toBeTruthy();
      expect(res.headers["cache-control"]).toBe("no-cache");
      expect(res.headers["content-length"]).toBeTruthy();
    });

    it("should return 404 when image file does not exist", async () => {
      const config = makeConfig({
        pages: [
          {
            outputPath: path.join(tempDir, "nonexistent"),
            imageFormat: "png",
          },
        ],
      });
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const res = await makeRequest(server, { path: "/" });
      expect(res.statusCode).toBe(404);
      expect(res.body.toString()).toContain("Image not found");
    });
  });

  describe("multi-page support", () => {
    let server;
    let secondImagePath;

    beforeAll(async () => {
      secondImagePath = path.join(tempDir, "cover2.png");
      await fs.writeFile(secondImagePath, testImageData);
    });

    afterAll(async () => {
      if (server) {
        await closeServer(server);
      }
    });

    it("should serve different pages", async () => {
      const config = makeConfig({
        pages: [
          { outputPath: path.join(tempDir, "cover"), imageFormat: "png" },
          { outputPath: path.join(tempDir, "cover2"), imageFormat: "png" },
        ],
      });
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const res1 = await makeRequest(server, { path: "/1" });
      expect(res1.statusCode).toBe(200);

      const res2 = await makeRequest(server, { path: "/2" });
      expect(res2.statusCode).toBe(200);

      const res3 = await makeRequest(server, { path: "/3" });
      expect(res3.statusCode).toBe(400);
    });
  });

  describe("basic auth", () => {
    let server;

    afterAll(async () => {
      if (server) {
        await closeServer(server);
      }
    });

    it("should require auth when configured", async () => {
      const config = makeConfig({
        httpAuthUser: "admin",
        httpAuthPassword: "secret",
      });
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const res = await makeRequest(server, { path: "/" });
      expect(res.statusCode).toBe(401);
      expect(res.headers["www-authenticate"]).toBeTruthy();
    });

    it("should accept valid credentials", async () => {
      const config = makeConfig({
        httpAuthUser: "admin",
        httpAuthPassword: "secret",
      });
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const auth = Buffer.from("admin:secret").toString("base64");
      const res = await makeRequest(server, {
        path: "/",
        headers: { Authorization: `Basic ${auth}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("should reject invalid credentials", async () => {
      const config = makeConfig({
        httpAuthUser: "admin",
        httpAuthPassword: "secret",
      });
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const auth = Buffer.from("admin:wrong").toString("base64");
      const res = await makeRequest(server, {
        path: "/",
        headers: { Authorization: `Basic ${auth}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it("should handle passwords with colons", async () => {
      const config = makeConfig({
        httpAuthUser: "admin",
        httpAuthPassword: "pass:with:colons",
      });
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const auth = Buffer.from("admin:pass:with:colons").toString("base64");
      const res = await makeRequest(server, {
        path: "/",
        headers: { Authorization: `Basic ${auth}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("should not require auth when not configured", async () => {
      const config = makeConfig({
        httpAuthUser: null,
        httpAuthPassword: null,
      });
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const res = await makeRequest(server, { path: "/" });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("battery tracking", () => {
    let server;

    afterAll(async () => {
      if (server) {
        await closeServer(server);
      }
    });

    it("should track battery level from query parameter", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      await makeRequest(server, { path: "/?batteryLevel=75" });
      expect(batteryStore[0]).toBeDefined();
      expect(batteryStore[0].batteryLevel).toBe(75);
    });

    it("should track charging status Yes", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      await makeRequest(server, {
        path: "/?batteryLevel=75&isCharging=Yes",
      });
      expect(batteryStore[0].isCharging).toBe(true);
    });

    it("should track charging status 1", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      await makeRequest(server, {
        path: "/?batteryLevel=75&isCharging=1",
      });
      expect(batteryStore[0].isCharging).toBe(true);
    });

    it("should track charging stopped", async () => {
      const config = makeConfig();
      const batteryStore = { 0: { batteryLevel: 75, isCharging: true } };
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      await makeRequest(server, {
        path: "/?batteryLevel=75&isCharging=No",
      });
      expect(batteryStore[0].isCharging).toBe(false);
    });

    it("should track charging stopped with 0", async () => {
      const config = makeConfig();
      const batteryStore = { 0: { batteryLevel: 75, isCharging: true } };
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      await makeRequest(server, {
        path: "/?batteryLevel=75&isCharging=0",
      });
      expect(batteryStore[0].isCharging).toBe(false);
    });

    it("should ignore battery level > 100", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      await makeRequest(server, { path: "/?batteryLevel=150" });
      // Battery store gets initialized but batteryLevel stays null for out-of-range
      expect(batteryStore[0]).toBeDefined();
      expect(batteryStore[0].batteryLevel).toBeNull();
    });

    it("should ignore negative battery level", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      await makeRequest(server, { path: "/?batteryLevel=-5" });
      expect(batteryStore[0]).toBeDefined();
      expect(batteryStore[0].batteryLevel).toBeNull();
    });

    it("should accept battery level 0", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      await makeRequest(server, { path: "/?batteryLevel=0" });
      expect(batteryStore[0]).toBeDefined();
      expect(batteryStore[0].batteryLevel).toBe(0);
    });

    it("should accept battery level 100", async () => {
      const config = makeConfig();
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      await makeRequest(server, { path: "/?batteryLevel=100" });
      expect(batteryStore[0]).toBeDefined();
      expect(batteryStore[0].batteryLevel).toBe(100);
    });
  });

  describe("image format", () => {
    let server;
    let jpegPath;

    beforeAll(async () => {
      jpegPath = path.join(tempDir, "cover.jpeg");
      await fs.writeFile(jpegPath, testImageData);
    });

    afterAll(async () => {
      if (server) {
        await closeServer(server);
      }
    });

    it("should serve jpeg images with correct content type", async () => {
      const config = makeConfig({
        pages: [
          {
            outputPath: path.join(tempDir, "cover"),
            imageFormat: "jpeg",
          },
        ],
      });
      const batteryStore = {};
      server = createHttpServer(config, batteryStore);
      await listenOnRandomPort(server);

      const res = await makeRequest(server, { path: "/" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("image/jpeg");
    });
  });
});
