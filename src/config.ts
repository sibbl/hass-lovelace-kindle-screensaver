import type { AppConfig, PageConfig } from "./types";

export function getEnvironmentVariable(
  key: string,
  suffix: string,
  fallbackValue?: string,
): string | undefined {
  const value = process.env[key + suffix];
  if (value !== undefined) return value;
  return fallbackValue ?? process.env[key];
}

export function getPagesConfig(): PageConfig[] {
  const pages: PageConfig[] = [];
  let i = 0;
  while (++i) {
    const suffix = i === 1 ? "" : `_${i}`;
    const screenShotUrl = process.env[`HA_SCREENSHOT_URL${suffix}`];
    if (!screenShotUrl) return pages;

    const imageFormatRaw = getEnvironmentVariable("IMAGE_FORMAT", suffix) ?? "png";
    const colorModeRaw = getEnvironmentVariable("COLOR_MODE", suffix) ?? "GrayScale";
    const prefersColorSchemeRaw = getEnvironmentVariable("PREFERS_COLOR_SCHEME", suffix) ?? "light";

    pages.push({
      screenShotUrl,
      imageFormat: parseImageFormat(imageFormatRaw),
      outputPath:
        getEnvironmentVariable("OUTPUT_PATH", suffix, `output/cover${suffix}`) ??
        `output/cover${suffix}`,
      renderingDelay: parseNumber(getEnvironmentVariable("RENDERING_DELAY", suffix), 0),
      renderingScreenSize: {
        height: parseNumber(getEnvironmentVariable("RENDERING_SCREEN_HEIGHT", suffix), 800),
        width: parseNumber(getEnvironmentVariable("RENDERING_SCREEN_WIDTH", suffix), 600),
      },
      grayscaleDepth: parseNumber(getEnvironmentVariable("GRAYSCALE_DEPTH", suffix), 8),
      removeGamma: getEnvironmentVariable("REMOVE_GAMMA", suffix) === "true",
      blackLevel: getEnvironmentVariable("BLACK_LEVEL", suffix) ?? "0%",
      whiteLevel: getEnvironmentVariable("WHITE_LEVEL", suffix) ?? "100%",
      dither: getEnvironmentVariable("DITHER", suffix) === "true",
      colorMode: parseColorMode(colorModeRaw),
      prefersColorScheme: parsePrefersColorScheme(prefersColorSchemeRaw),
      rotation: parseNumber(getEnvironmentVariable("ROTATION", suffix), 0),
      scaling: parseNumber(getEnvironmentVariable("SCALING", suffix), 1),
      batteryWebHook: getEnvironmentVariable("HA_BATTERY_WEBHOOK", suffix) ?? null,
      saturation: parseNumber(getEnvironmentVariable("SATURATION", suffix), 1),
      contrast: parseNumber(getEnvironmentVariable("CONTRAST", suffix), 1),
    });
  }
  return pages;
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function parseImageFormat(value: string): PageConfig["imageFormat"] {
  if (value === "png" || value === "jpeg" || value === "bmp") {
    return value;
  }
  return "png";
}

function parseColorMode(value: string): PageConfig["colorMode"] {
  if (value === "GrayScale" || value === "TrueColor") {
    return value;
  }
  return "GrayScale";
}

function parsePrefersColorScheme(value: string): PageConfig["prefersColorScheme"] {
  if (value === "light" || value === "dark") {
    return value;
  }
  return "light";
}

export function loadConfig(): AppConfig {
  return {
    baseUrl: process.env["HA_BASE_URL"],
    accessToken: process.env["HA_ACCESS_TOKEN"],
    cronJob: process.env["CRON_JOB"] ?? "* * * * *",
    useImageMagick: process.env["USE_IMAGE_MAGICK"] === "true",
    pages: getPagesConfig(),
    port: parseNumber(process.env["PORT"], 5000),
    renderingTimeout: parseNumber(process.env["RENDERING_TIMEOUT"], 10000),
    browserLaunchTimeout: parseNumber(process.env["BROWSER_LAUNCH_TIMEOUT"], 30000),
    language: process.env["LANGUAGE"] ?? "en",
    theme: process.env["HA_THEME"] ? { theme: process.env["HA_THEME"] } : null,
    debug: process.env["DEBUG"] === "true",
    ignoreCertificateErrors: process.env["UNSAFE_IGNORE_CERTIFICATE_ERRORS"] === "true",
    httpAuthUser: process.env["HTTP_AUTH_USER"] ?? null,
    httpAuthPassword: process.env["HTTP_AUTH_PASSWORD"] ?? null,
  };
}
