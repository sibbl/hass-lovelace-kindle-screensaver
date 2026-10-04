import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";

let child;
let directory;
let port;

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "screensaver-http-"));
  await writeFile(path.join(directory, "public.png"), "public image");
  await writeFile(path.join(directory, "private.png"), "private image");
  // Run the real HTTP handler without a live HA instance or a Chromium process.
  child = spawn(process.execPath, ["-e", `
    const http = require("http");
    const listen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
      this.once("listening", () => process.send({ port: this.address().port }));
      return listen.apply(this, args);
    };
    require("puppeteer").launch = async () => { throw new Error("Test browser offline"); };
    require("./index.js");
  `], {
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    env: {
      PATH: process.env.PATH,
      PORT: "0",
      HA_BASE_URL: "http://127.0.0.1:8123",
      HA_ACCESS_TOKEN: "test-token",
      HA_SCREENSHOT_URL: "/dashboard",
      HA_SCREENSHOT_URL_2: "/dashboard-private",
      HTTP_AUTH_USER_2: "private-user",
      HTTP_AUTH_PASSWORD_2: "private-password",
      OUTPUT_PATH: path.join(directory, "public"),
      OUTPUT_PATH_2: path.join(directory, "private"),
      CRON_JOB: "0 0 1 1 *"
    },
    stdio: ["ignore", "ignore", "ignore", "ipc"]
  });
  const [message] = await once(child, "message");
  port = message.port;
});

afterAll(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

function request(target, { method = "GET", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: target, method, headers }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(2000, () => req.destroy(new Error("Test request timeout")));
    req.end();
  });
}

it("serves public images and requires the matching credentials for private images", async () => {
  expect(await request("/")).toEqual({ status: 200, body: "public image" });
  expect((await request("/2")).status).toBe(401);
  expect((await request("/render/2", { method: "POST" })).status).toBe(401);
  const authorization = `Basic ${Buffer.from("private-user:private-password").toString("base64")}`;
  expect(await request("/2", { headers: { authorization } }))
    .toEqual({ status: 200, body: "private image" });
});

it.each(["/02", "/2anything", "/2/extra", "/2%00", "/+2", "/render/02"])(
  "does not bypass page-specific authentication using %s", async target => {
    const result = await request(target, { method: target.startsWith("/render") ? "POST" : "GET" });
    expect(result.status).toBe(400);
    expect(result.body).not.toContain("private image");
  }
);

it("ignores malformed Host values and survives invalid URL targets", async () => {
  expect((await request("/health", { headers: { Host: "[" } })).status).toBe(200);
  expect((await request("http://[")).status).toBe(400);
  expect((await request("/health")).status).toBe(200);
  expect(child.exitCode).toBe(null);
});
