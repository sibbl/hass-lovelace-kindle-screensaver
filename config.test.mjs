import { createRequire } from "module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const originalBrowserCacheTtl = process.env.BROWSER_CACHE_TTL_SECONDS;

function loadConfig() {
  delete require.cache[require.resolve("./config.js")];
  return require("./config.js");
}

afterEach(() => {
  if (originalBrowserCacheTtl === undefined) {
    delete process.env.BROWSER_CACHE_TTL_SECONDS;
  } else {
    process.env.BROWSER_CACHE_TTL_SECONDS = originalBrowserCacheTtl;
  }
  delete require.cache[require.resolve("./config.js")];
});

describe("config", () => {
  it("defaults browser cache TTL to one day", () => {
    delete process.env.BROWSER_CACHE_TTL_SECONDS;

    const config = loadConfig();

    expect(config.browserCacheTtlSeconds).toBe(86400);
    expect(config.browserCacheTtl).toBe(86400000);
  });

  it("allows disabling browser cache TTL", () => {
    process.env.BROWSER_CACHE_TTL_SECONDS = "0";

    const config = loadConfig();

    expect(config.browserCacheTtlSeconds).toBe(0);
    expect(config.browserCacheTtl).toBe(0);
  });
});
