import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getEnvironmentVariable,
  getPagesConfig,
  loadConfig,
} from "../../lib/config.js";

describe("config", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear all HA_ related env vars
    Object.keys(process.env).forEach((key) => {
      if (
        key.startsWith("HA_") ||
        key.startsWith("RENDERING_") ||
        key.startsWith("OUTPUT_") ||
        key.startsWith("IMAGE_") ||
        key.startsWith("GRAYSCALE_") ||
        key.startsWith("COLOR_") ||
        key.startsWith("REMOVE_") ||
        key.startsWith("PREFERS_") ||
        key.startsWith("BLACK_") ||
        key.startsWith("WHITE_") ||
        key.startsWith("BROWSER_") ||
        key.startsWith("HTTP_AUTH") ||
        key === "CRON_JOB" ||
        key === "USE_IMAGE_MAGICK" ||
        key === "PORT" ||
        key === "LANGUAGE" ||
        key === "DEBUG" ||
        key === "UNSAFE_IGNORE_CERTIFICATE_ERRORS" ||
        key === "ROTATION" ||
        key === "SCALING" ||
        key === "DITHER" ||
        key === "SATURATION" ||
        key === "CONTRAST"
      ) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getEnvironmentVariable", () => {
    it("should return value with suffix when available", () => {
      process.env["TEST_KEY_2"] = "suffixed_value";
      
      expect(getEnvironmentVariable("TEST_KEY", "_2")).toBe("suffixed_value");
      delete process.env["TEST_KEY_2"];
    });

    it("should return fallback value when suffixed key is not set", () => {
      
      expect(getEnvironmentVariable("TEST_KEY", "_2", "fallback")).toBe(
        "fallback"
      );
    });

    it("should return base key value when suffixed key and fallback are not set", () => {
      process.env["TEST_KEY"] = "base_value";
      
      expect(getEnvironmentVariable("TEST_KEY", "_2")).toBe("base_value");
      delete process.env["TEST_KEY"];
    });

    it("should return undefined when no value exists", () => {
      
      expect(getEnvironmentVariable("NONEXISTENT_KEY", "_2")).toBeUndefined();
    });

    it("should prefer suffixed value over fallback", () => {
      process.env["TEST_KEY_2"] = "suffixed";
      
      expect(getEnvironmentVariable("TEST_KEY", "_2", "fallback")).toBe(
        "suffixed"
      );
      delete process.env["TEST_KEY_2"];
    });

    it("should handle empty string suffix", () => {
      process.env["TEST_KEY"] = "direct_value";
      
      expect(getEnvironmentVariable("TEST_KEY", "")).toBe("direct_value");
      delete process.env["TEST_KEY"];
    });
  });

  describe("getPagesConfig", () => {
    it("should return empty array when no HA_SCREENSHOT_URL is set", () => {
      
      expect(getPagesConfig()).toEqual([]);
    });

    it("should parse a single page config with defaults", () => {
      process.env["HA_SCREENSHOT_URL"] = "/lovelace/0";
      
      const pages = getPagesConfig();
      expect(pages).toHaveLength(1);
      expect(pages[0].screenShotUrl).toBe("/lovelace/0");
      expect(pages[0].imageFormat).toBe("png");
      expect(pages[0].outputPath).toBe("output/cover");
      expect(pages[0].renderingDelay).toBe(0);
      expect(pages[0].renderingScreenSize.height).toBe(800);
      expect(pages[0].renderingScreenSize.width).toBe(600);
      expect(pages[0].grayscaleDepth).toBe(8);
      expect(pages[0].removeGamma).toBe(false);
      expect(pages[0].blackLevel).toBe("0%");
      expect(pages[0].whiteLevel).toBe("100%");
      expect(pages[0].dither).toBe(false);
      expect(pages[0].colorMode).toBe("GrayScale");
      expect(pages[0].prefersColorScheme).toBe("light");
      expect(pages[0].rotation).toBe(0);
      expect(pages[0].scaling).toBe(1);
      expect(pages[0].batteryWebHook).toBeNull();
      expect(pages[0].saturation).toBe(1);
      expect(pages[0].contrast).toBe(1);
    });

    it("should parse multiple page configs", () => {
      process.env["HA_SCREENSHOT_URL"] = "/lovelace/0";
      process.env["HA_SCREENSHOT_URL_2"] = "/lovelace/1";
      process.env["HA_SCREENSHOT_URL_3"] = "/lovelace/2";
      
      const pages = getPagesConfig();
      expect(pages).toHaveLength(3);
      expect(pages[0].screenShotUrl).toBe("/lovelace/0");
      expect(pages[1].screenShotUrl).toBe("/lovelace/1");
      expect(pages[2].screenShotUrl).toBe("/lovelace/2");
    });

    it("should use per-page overrides", () => {
      process.env["HA_SCREENSHOT_URL"] = "/lovelace/0";
      process.env["HA_SCREENSHOT_URL_2"] = "/lovelace/1";
      process.env["RENDERING_SCREEN_HEIGHT_2"] = "1024";
      process.env["RENDERING_SCREEN_WIDTH_2"] = "768";
      process.env["ROTATION_2"] = "90";
      process.env["IMAGE_FORMAT_2"] = "jpeg";
      
      const pages = getPagesConfig();
      expect(pages).toHaveLength(2);
      expect(pages[1].renderingScreenSize.height).toBe("1024");
      expect(pages[1].renderingScreenSize.width).toBe("768");
      expect(pages[1].rotation).toBe("90");
      expect(pages[1].imageFormat).toBe("jpeg");
      // First page should have defaults
      expect(pages[0].renderingScreenSize.height).toBe(800);
      expect(pages[0].rotation).toBe(0);
    });

    it("should handle custom output paths per page", () => {
      process.env["HA_SCREENSHOT_URL"] = "/lovelace/0";
      process.env["HA_SCREENSHOT_URL_2"] = "/lovelace/1";
      process.env["OUTPUT_PATH"] = "/output/main";
      process.env["OUTPUT_PATH_2"] = "/output/secondary";
      
      const pages = getPagesConfig();
      expect(pages[0].outputPath).toBe("/output/main");
      expect(pages[1].outputPath).toBe("/output/secondary");
    });

    it("should handle boolean-like values", () => {
      process.env["HA_SCREENSHOT_URL"] = "/lovelace/0";
      process.env["REMOVE_GAMMA"] = "true";
      process.env["DITHER"] = "true";
      
      const pages = getPagesConfig();
      expect(pages[0].removeGamma).toBe(true);
      expect(pages[0].dither).toBe(true);
    });

    it("should handle non-true boolean values", () => {
      process.env["HA_SCREENSHOT_URL"] = "/lovelace/0";
      process.env["REMOVE_GAMMA"] = "false";
      process.env["DITHER"] = "no";
      
      const pages = getPagesConfig();
      expect(pages[0].removeGamma).toBe(false);
      expect(pages[0].dither).toBe(false);
    });

    it("should support battery webhook per page", () => {
      process.env["HA_SCREENSHOT_URL"] = "/lovelace/0";
      process.env["HA_BATTERY_WEBHOOK"] = "kindle_battery";
      
      const pages = getPagesConfig();
      expect(pages[0].batteryWebHook).toBe("kindle_battery");
    });

    it("should use fallback for second page when per-page value is not set", () => {
      process.env["HA_SCREENSHOT_URL"] = "/lovelace/0";
      process.env["HA_SCREENSHOT_URL_2"] = "/lovelace/1";
      process.env["GRAYSCALE_DEPTH"] = "4";
      
      const pages = getPagesConfig();
      expect(pages[0].grayscaleDepth).toBe("4");
      expect(pages[1].grayscaleDepth).toBe("4");
    });
  });

  describe("loadConfig", () => {
    it("should load config with defaults", () => {
      
      const config = loadConfig();
      expect(config.cronJob).toBe("* * * * *");
      expect(config.useImageMagick).toBe(false);
      expect(config.port).toBe(5000);
      expect(config.renderingTimeout).toBe(10000);
      expect(config.browserLaunchTimeout).toBe(30000);
      expect(config.language).toBe("en");
      expect(config.theme).toBeNull();
      expect(config.debug).toBe(false);
      expect(config.ignoreCertificateErrors).toBe(false);
      expect(config.httpAuthUser).toBeNull();
      expect(config.httpAuthPassword).toBeNull();
    });

    it("should load base URL and access token", () => {
      process.env["HA_BASE_URL"] = "http://ha.local:8123";
      process.env["HA_ACCESS_TOKEN"] = "test-token";
      
      const config = loadConfig();
      expect(config.baseUrl).toBe("http://ha.local:8123");
      expect(config.accessToken).toBe("test-token");
    });

    it("should parse USE_IMAGE_MAGICK", () => {
      process.env["USE_IMAGE_MAGICK"] = "true";
      
      expect(loadConfig().useImageMagick).toBe(true);
    });

    it("should parse DEBUG", () => {
      process.env["DEBUG"] = "true";
      
      expect(loadConfig().debug).toBe(true);
    });

    it("should parse UNSAFE_IGNORE_CERTIFICATE_ERRORS", () => {
      process.env["UNSAFE_IGNORE_CERTIFICATE_ERRORS"] = "true";
      
      expect(loadConfig().ignoreCertificateErrors).toBe(true);
    });

    it("should parse theme", () => {
      process.env["HA_THEME"] = "dark";
      
      expect(loadConfig().theme).toEqual({ theme: "dark" });
    });

    it("should parse custom port", () => {
      process.env["PORT"] = "8080";
      
      expect(loadConfig().port).toBe("8080");
    });

    it("should parse HTTP auth credentials", () => {
      process.env["HTTP_AUTH_USER"] = "admin";
      process.env["HTTP_AUTH_PASSWORD"] = "secret";
      
      const config = loadConfig();
      expect(config.httpAuthUser).toBe("admin");
      expect(config.httpAuthPassword).toBe("secret");
    });

    it("should parse custom cron job", () => {
      process.env["CRON_JOB"] = "*/5 * * * *";
      
      expect(loadConfig().cronJob).toBe("*/5 * * * *");
    });

    it("should parse rendering timeout", () => {
      process.env["RENDERING_TIMEOUT"] = "60000";
      
      expect(loadConfig().renderingTimeout).toBe("60000");
    });

    it("should parse browser launch timeout", () => {
      process.env["BROWSER_LAUNCH_TIMEOUT"] = "60000";
      
      expect(loadConfig().browserLaunchTimeout).toBe("60000");
    });

    it("should parse language", () => {
      process.env["LANGUAGE"] = "de";
      
      expect(loadConfig().language).toBe("de");
    });
  });
});
