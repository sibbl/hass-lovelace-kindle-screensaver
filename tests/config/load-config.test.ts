import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config";

describe("configuration loading", () => {
  it("defaults browser cache TTL to one day", () => {
    const config = loadConfig({});

    expect(config.browserCacheTtlSeconds).toBe(86400);
    expect(config.browserCacheTtl).toBe(86400000);
  });

  it("allows disabling browser cache TTL", () => {
    const config = loadConfig({ BROWSER_CACHE_TTL_SECONDS: "0" });

    expect(config.browserCacheTtlSeconds).toBe(0);
    expect(config.browserCacheTtl).toBe(0);
  });

  it("keeps legacy Home Assistant configuration on the first page", () => {
    const config = loadConfig({
      HA_BASE_URL: "https://home.example.test",
      HA_SCREENSHOT_URL: "/lovelace/kindle",
      HA_ACCESS_TOKEN: "legacy-token",
      HA_THEME: "eink",
      LANGUAGE: "de"
    });

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
    const config = loadConfig({
      HA_BASE_URL: "https://home.example.test",
      HA_SCREENSHOT_URL: "/lovelace/first",
      HA_SCREENSHOT_URL_2: "/lovelace/second",
      HA_ACCESS_TOKEN: "shared-token"
    });

    expect(config.pages).toHaveLength(2);
    expect(config.pages[1]).toMatchObject({
      baseUrl: "https://home.example.test",
      accessToken: "shared-token",
      language: "en"
    });
  });

  it("allows additional pages to override their Home Assistant instance", () => {
    const config = loadConfig({
      HA_BASE_URL: "https://first.example.test",
      HA_SCREENSHOT_URL: "/lovelace/first",
      HA_ACCESS_TOKEN: "first-token",
      HA_BASE_URL_2: "https://second.example.test",
      HA_SCREENSHOT_URL_2: "/lovelace/second",
      HA_ACCESS_TOKEN_2: "second-token",
      HA_THEME_2: "night",
      LANGUAGE_2: "fr"
    });

    expect(config.pages[1]).toMatchObject({
      baseUrl: "https://second.example.test",
      screenShotUrl: "/lovelace/second",
      accessToken: "second-token",
      language: "fr",
      theme: { theme: "night" }
    });
  });

  it("allows numbered pages to override inherited HTTP auth credentials", () => {
    const config = loadConfig({
      HA_SCREENSHOT_URL: "/lovelace/first",
      HA_SCREENSHOT_URL_2: "/lovelace/second",
      HA_SCREENSHOT_URL_3: "/lovelace/third",
      HTTP_AUTH_USER: "shared-user",
      HTTP_AUTH_PASSWORD: "shared-password",
      HTTP_AUTH_USER_3: "third-user",
      HTTP_AUTH_PASSWORD_3: "third-password"
    });

    expect(config.pages[1]).toMatchObject({
      httpAuthUser: "shared-user",
      httpAuthPassword: "shared-password"
    });
    expect(config.pages[2]).toMatchObject({
      httpAuthUser: "third-user",
      httpAuthPassword: "third-password"
    });
  });

  it("stops page discovery at the first missing screenshot URL", () => {
    const config = loadConfig({
      HA_BASE_URL: "https://first.example.test",
      HA_SCREENSHOT_URL: "/lovelace/first",
      HA_ACCESS_TOKEN: "first-token",
      HA_BASE_URL_3: "https://third.example.test",
      HA_SCREENSHOT_URL_3: "/lovelace/third",
      HA_ACCESS_TOKEN_3: "third-token"
    });

    expect(config.pages).toHaveLength(1);
  });

  it("normalizes numeric page settings into typed values", () => {
    const config = loadConfig({
      HA_BASE_URL: "https://home.example.test",
      HA_SCREENSHOT_URL: "/lovelace/kindle",
      HA_ACCESS_TOKEN: "token",
      RENDERING_DELAY: "250",
      RENDERING_SCREEN_WIDTH: "1072",
      SCALING: "1.5",
      ROTATION: "90",
      SATURATION: "0.75"
    });

    expect(config.pages[0]).toMatchObject({
      renderingDelay: 250,
      renderingScreenSize: { width: 1072, height: 800 },
      scaling: 1.5,
      rotation: 90,
      saturation: 0.75
    });
  });
});
