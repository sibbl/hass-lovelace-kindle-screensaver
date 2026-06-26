import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getFileHash,
  getHealthcheckMaxAge,
  getRenderJobTimeout
} from "./rendering";
import type { AppConfig, PageConfig } from "./types";

const tempDirectories: string[] = [];

afterEach(async () => {
  for (const tempDirectory of tempDirectories.splice(0)) {
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

describe("rendering helpers", () => {
  it("hashes existing files and returns null for missing files", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "hass-kindle-rendering-test-")
    );
    tempDirectories.push(tempDirectory);
    const filePath = path.join(tempDirectory, "cover.png");
    await writeFile(filePath, "image-bytes");

    await expect(getFileHash(filePath)).resolves.toMatch(
      /^[a-f0-9]{64}$/
    );
    await expect(getFileHash(path.join(tempDirectory, "missing.png"))).resolves.toBeNull();
  });

  it("budgets render jobs across all configured pages", () => {
    const config = createConfig({
      renderingTimeout: 10000,
      pages: [
        createPageConfig({ renderingDelay: 0 }),
        createPageConfig({ renderingDelay: 5000 })
      ]
    });

    expect(getRenderJobTimeout(config)).toBe(85000);
  });

  it("derives health max age from cron interval and render budget", () => {
    const config = createConfig({
      cronJob: "* * * * *",
      renderingTimeout: 10000,
      pages: [createPageConfig({ renderingDelay: 0 })]
    });

    expect(getHealthcheckMaxAge(config, getRenderJobTimeout(config))).toBe(
      100000
    );
  });

  it("falls back to one minute plus render budget for invalid cron expressions", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = createConfig({
      cronJob: "not a cron",
      renderingTimeout: 10000,
      pages: [createPageConfig({ renderingDelay: 0 })]
    });

    expect(getHealthcheckMaxAge(config, getRenderJobTimeout(config))).toBe(
      100000
    );
    errorSpy.mockRestore();
  });
});

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    baseUrl: "https://homeassistant.example",
    accessToken: "token",
    cronJob: "* * * * *",
    useImageMagick: false,
    pages: [createPageConfig()],
    port: 5000,
    renderingTimeout: 10000,
    browserLaunchTimeout: 30000,
    browserCacheTtlSeconds: 86400,
    browserCacheTtl: 86400000,
    language: "en",
    theme: null,
    debug: false,
    ignoreCertificateErrors: false,
    httpAuthUser: null,
    httpAuthPassword: null,
    ...overrides
  };
}

function createPageConfig(overrides: Partial<PageConfig> = {}): PageConfig {
  return {
    screenShotUrl: "/lovelace/0",
    imageFormat: "png",
    outputPath: "output/cover",
    renderingDelay: 0,
    renderingScreenSize: {
      width: 600,
      height: 800
    },
    grayscaleDepth: 8,
    removeGamma: true,
    blackLevel: "0%",
    whiteLevel: "100%",
    dither: false,
    colorMode: "GrayScale",
    prefersColorScheme: "light",
    rotation: 0,
    scaling: 1,
    batteryWebHook: null,
    saturation: 1,
    contrast: 1,
    ...overrides
  };
}
