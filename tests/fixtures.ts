import type { AppConfig, PageConfig } from "../src/types";

export function createPageConfig(
  overrides: Partial<PageConfig> = {}
): PageConfig {
  return {
    baseUrl: "https://home.example.test",
    accessToken: "token",
    screenShotUrl: "/lovelace/kindle",
    language: "en",
    theme: null,
    imageFormat: "png",
    outputPath: "/output/cover",
    renderingDelay: 0,
    renderingScreenSize: { width: 600, height: 800 },
    grayscaleDepth: 8,
    removeGamma: false,
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
    httpAuthUser: null,
    httpAuthPassword: null,
    ...overrides
  };
}

export function createAppConfig(
  overrides: Partial<AppConfig> = {}
): AppConfig {
  return {
    baseUrl: "https://home.example.test",
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
