import { createRequire } from "module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const managedEnvironmentVariables = [
  "BROWSER_CACHE_TTL_SECONDS",
  "HA_BASE_URL",
  "HA_BASE_URL_2",
  "HA_SCREENSHOT_URL",
  "HA_SCREENSHOT_URL_2",
  "HA_ACCESS_TOKEN",
  "HA_ACCESS_TOKEN_2",
  "HA_THEME",
  "HA_THEME_2",
  "LANGUAGE",
  "LANGUAGE_2"
];
const originalEnvironment = Object.fromEntries(
  managedEnvironmentVariables.map((key) => [key, process.env[key]])
);

function loadConfig() {
  delete require.cache[require.resolve("./config.js")];
  return require("./config.js");
}

beforeEach(() => {
  for (const key of managedEnvironmentVariables) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of managedEnvironmentVariables) {
    if (originalEnvironment[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnvironment[key];
    }
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

  it("keeps legacy Home Assistant configuration on the first page", () => {
    process.env.HA_BASE_URL = "https://home.example.test";
    process.env.HA_SCREENSHOT_URL = "/lovelace/kindle";
    process.env.HA_ACCESS_TOKEN = "legacy-token";
    process.env.HA_THEME = "eink";
    process.env.LANGUAGE = "de";

    const config = loadConfig();

    expect(config.baseUrl).toBe("https://home.example.test");
    expect(config.accessToken).toBe("legacy-token");
    expect(config.pages).toHaveLength(1);
    expect(config.pages[0]).toMatchObject({
      baseUrl: "https://home.example.test",
      screenShotUrl: "/lovelace/kindle",
      accessToken: "legacy-token",
      language: "de",
      theme: { theme: "eink" }
    });
  });

  it("inherits legacy values when additional pages use the same instance", () => {
    process.env.HA_BASE_URL = "https://home.example.test";
    process.env.HA_SCREENSHOT_URL = "/lovelace/first";
    process.env.HA_SCREENSHOT_URL_2 = "/lovelace/second";
    process.env.HA_ACCESS_TOKEN = "shared-token";

    const config = loadConfig();

    expect(config.pages).toHaveLength(2);
    expect(config.pages[1]).toMatchObject({
      baseUrl: "https://home.example.test",
      accessToken: "shared-token",
      language: "en"
    });
  });

  it("allows additional pages to override their Home Assistant instance", () => {
    process.env.HA_BASE_URL = "https://first.example.test";
    process.env.HA_SCREENSHOT_URL = "/lovelace/first";
    process.env.HA_ACCESS_TOKEN = "first-token";
    process.env.HA_BASE_URL_2 = "https://second.example.test";
    process.env.HA_SCREENSHOT_URL_2 = "/lovelace/second";
    process.env.HA_ACCESS_TOKEN_2 = "second-token";
    process.env.HA_THEME_2 = "night";
    process.env.LANGUAGE_2 = "fr";

    const config = loadConfig();

    expect(config.pages).toHaveLength(2);
    expect(config.pages[1]).toMatchObject({
      baseUrl: "https://second.example.test",
      screenShotUrl: "/lovelace/second",
      accessToken: "second-token",
      language: "fr",
      theme: { theme: "night" }
    });
  });
});
