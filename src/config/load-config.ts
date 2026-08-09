import type { AppConfig, HomeAssistantTheme, PageConfig } from "../types";

function getEnvironmentVariable(
  environment: NodeJS.ProcessEnv,
  key: string,
  suffix: string,
  fallbackValue?: string,
): string | undefined {
  const value = environment[`${key}${suffix}`];
  if (value !== undefined) {
    return value;
  }
  return fallbackValue ?? environment[key];
}

function parseInteger(value: string | undefined, fallbackValue: number): number {
  if (value === undefined || value === "") {
    return fallbackValue;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function parseNonNegativeInteger(value: string | undefined, fallbackValue: number): number {
  const parsed = parseInteger(value, fallbackValue);
  return parsed >= 0 ? parsed : fallbackValue;
}

function parseNumber(value: string | undefined, fallbackValue: number): number {
  if (value === undefined || value === "") {
    return fallbackValue;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function parseBoolean(value: string | undefined): boolean {
  return value === "true";
}

function parseTheme(value: string | undefined): HomeAssistantTheme | null {
  return value ? { theme: value } : null;
}

function getPagesConfig(environment: NodeJS.ProcessEnv): PageConfig[] {
  const pages: PageConfig[] = [];

  for (let pageNumber = 1; ; pageNumber += 1) {
    const suffix = pageNumber === 1 ? "" : `_${pageNumber}`;
    const screenShotUrl = environment[`HA_SCREENSHOT_URL${suffix}`];
    if (!screenShotUrl) {
      return pages;
    }

    pages.push({
      baseUrl: getEnvironmentVariable(environment, "HA_BASE_URL", suffix) ?? "",
      accessToken: getEnvironmentVariable(environment, "HA_ACCESS_TOKEN", suffix) ?? "",
      screenShotUrl,
      language: getEnvironmentVariable(environment, "LANGUAGE", suffix) || "en",
      theme: parseTheme(getEnvironmentVariable(environment, "HA_THEME", suffix)),
      imageFormat: getEnvironmentVariable(environment, "IMAGE_FORMAT", suffix) || "png",
      outputPath:
        getEnvironmentVariable(environment, "OUTPUT_PATH", suffix, `output/cover${suffix}`) ??
        `output/cover${suffix}`,
      renderingDelay: parseNumber(
        getEnvironmentVariable(environment, "RENDERING_DELAY", suffix),
        0,
      ),
      renderingScreenSize: {
        height: parseNumber(
          getEnvironmentVariable(environment, "RENDERING_SCREEN_HEIGHT", suffix),
          800,
        ),
        width: parseNumber(
          getEnvironmentVariable(environment, "RENDERING_SCREEN_WIDTH", suffix),
          600,
        ),
      },
      grayscaleDepth: parseNumber(
        getEnvironmentVariable(environment, "GRAYSCALE_DEPTH", suffix),
        8,
      ),
      removeGamma: parseBoolean(getEnvironmentVariable(environment, "REMOVE_GAMMA", suffix)),
      blackLevel: getEnvironmentVariable(environment, "BLACK_LEVEL", suffix) || "0%",
      whiteLevel: getEnvironmentVariable(environment, "WHITE_LEVEL", suffix) || "100%",
      dither: parseBoolean(getEnvironmentVariable(environment, "DITHER", suffix)),
      colorMode: getEnvironmentVariable(environment, "COLOR_MODE", suffix) || "GrayScale",
      prefersColorScheme:
        getEnvironmentVariable(environment, "PREFERS_COLOR_SCHEME", suffix) || "light",
      rotation: parseNumber(getEnvironmentVariable(environment, "ROTATION", suffix), 0),
      scaling: parseNumber(getEnvironmentVariable(environment, "SCALING", suffix), 1),
      batteryWebHook: getEnvironmentVariable(environment, "HA_BATTERY_WEBHOOK", suffix) || null,
      saturation: parseNumber(getEnvironmentVariable(environment, "SATURATION", suffix), 1),
      contrast: parseNumber(getEnvironmentVariable(environment, "CONTRAST", suffix), 1),
      httpAuthUser: getEnvironmentVariable(environment, "HTTP_AUTH_USER", suffix) || null,
      httpAuthPassword:
        getEnvironmentVariable(environment, "HTTP_AUTH_PASSWORD", suffix) || null,
    });
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const browserCacheTtlSeconds = parseNonNegativeInteger(
    environment.BROWSER_CACHE_TTL_SECONDS,
    86400,
  );

  return {
    baseUrl: environment.HA_BASE_URL,
    accessToken: environment.HA_ACCESS_TOKEN,
    cronJob: environment.CRON_JOB || "* * * * *",
    useImageMagick: environment.USE_IMAGE_MAGICK === "true",
    pages: getPagesConfig(environment),
    port: parseInteger(environment.PORT, 5000),
    renderingTimeout: parseInteger(environment.RENDERING_TIMEOUT, 10000),
    browserLaunchTimeout: parseInteger(environment.BROWSER_LAUNCH_TIMEOUT, 30000),
    browserCacheTtlSeconds,
    browserCacheTtl: browserCacheTtlSeconds * 1000,
    language: environment.LANGUAGE || "en",
    theme: parseTheme(environment.HA_THEME),
    debug: environment.DEBUG === "true",
    ignoreCertificateErrors: environment.UNSAFE_IGNORE_CERTIFICATE_ERRORS === "true",
    httpAuthUser: environment.HTTP_AUTH_USER || null,
    httpAuthPassword: environment.HTTP_AUTH_PASSWORD || null,
  };
}
