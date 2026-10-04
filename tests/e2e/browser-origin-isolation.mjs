import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";

// Executed on stdin inside each built image, exercising its production modules.
const require = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require("playwright-core");
const { HomeAssistantAuth } = require("./dist/browser/home-assistant-auth.js");
const { loadConfig } = require("./dist/config/load-config.js");

async function listen(handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

const foreign = await listen((_request, response) => {
  response.end("<!doctype html><title>Foreign origin</title>");
});
const home = await listen((request, response) => {
  if (request.url === "/redirect") {
    response.writeHead(302, { Location: foreign.origin });
    response.end();
    return;
  }
  response.setHeader("Content-Type", "text/html");
  response.end(`<!doctype html><iframe src="${foreign.origin}"></iframe>`);
});
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const config = loadConfig({
    HA_BASE_URL: home.origin,
    HA_ACCESS_TOKEN: "isolation-test-token",
    HA_SCREENSHOT_URL: "/",
  });
  const context = await new HomeAssistantAuth().getAuthenticatedContext(browser, config.pages[0]);
  const page = await context.newPage();
  await page.goto(home.origin);
  const token = await page.evaluate(() => localStorage.getItem("hassTokens"));
  assert.equal(JSON.parse(token).access_token, "isolation-test-token");
  const frame = page.frames().find((candidate) => candidate.url().startsWith(foreign.origin));
  assert.ok(frame, "foreign iframe loaded");
  assert.equal(await frame.evaluate(() => localStorage.getItem("hassTokens")), null);
  await page.goto(`${home.origin}/redirect`);
  assert.equal(new URL(page.url()).origin, foreign.origin);
  assert.equal(await page.evaluate(() => localStorage.getItem("hassTokens")), null);
  await page.goto(home.origin);
  assert.equal(await page.evaluate(() => localStorage.getItem("hassTokens")), token);
  await context.close();
  console.log(
    "Browser token isolation passed: HA origin, foreign iframe, redirect and return navigation",
  );
} finally {
  await browser?.close();
  await Promise.all(
    [home.server, foreign.server].map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        }),
    ),
  );
}
