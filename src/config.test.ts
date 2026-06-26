import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const originalBrowserCacheTtl = process.env["BROWSER_CACHE_TTL_SECONDS"];

afterEach(() => {
  if (originalBrowserCacheTtl === undefined) {
    delete process.env["BROWSER_CACHE_TTL_SECONDS"];
  } else {
    process.env["BROWSER_CACHE_TTL_SECONDS"] = originalBrowserCacheTtl;
  }
});

describe("config", () => {
  it("defaults browser cache TTL to one day", () => {
    const config = loadConfig({
      HA_SCREENSHOT_URL: "/lovelace/0"
    });

    expect(config.browserCacheTtlSeconds).toBe(86400);
    expect(config.browserCacheTtl).toBe(86400000);
  });

  it("allows disabling browser cache TTL", () => {
    const config = loadConfig({
      HA_SCREENSHOT_URL: "/lovelace/0",
      BROWSER_CACHE_TTL_SECONDS: "0"
    });

    expect(config.browserCacheTtlSeconds).toBe(0);
    expect(config.browserCacheTtl).toBe(0);
  });

  it("parses suffixed page configuration with typed numeric fields", () => {
    const config = loadConfig({
      HA_SCREENSHOT_URL: "/lovelace/0",
      HA_SCREENSHOT_URL_2: "/lovelace/1",
      RENDERING_DELAY_2: "1500",
      RENDERING_SCREEN_WIDTH_2: "1024",
      RENDERING_SCREEN_HEIGHT_2: "758",
      IMAGE_FORMAT_2: "bmp",
      ROTATION_2: "90",
      SCALING_2: "1.25"
    });

    expect(config.pages).toHaveLength(2);
    expect(config.pages[1]).toMatchObject({
      screenShotUrl: "/lovelace/1",
      imageFormat: "bmp",
      renderingDelay: 1500,
      renderingScreenSize: {
        width: 1024,
        height: 758
      },
      rotation: 90,
      scaling: 1.25
    });
  });
});
