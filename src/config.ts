import type {
  AppConfig,
  ColorMode,
  ImageFormat,
  PageConfig,
  PreferredColorScheme
} from "./types";

type Env = NodeJS.ProcessEnv;

const DEFAULT_BROWSER_CACHE_TTL_SECONDS = 86400;

function getEnvironmentVariable(
  env: Env,
  key: string,
  suffix: string,
  fallbackValue?: string
): string | undefined {
  const suffixedValue = env[`${key}${suffix}`];
  if (suffixedValue !== undefined) {
    return suffixedValue;
  }

  return fallbackValue ?? env[key];
}

function parseIntegerEnvironmentVariable(
  env: Env,
  key: string,
  fallbackValue: number
): number {
  const value = env[key];
  if (value === undefined || value === "") {
    return fallbackValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function parseFloatEnvironmentVariable(
  env: Env,
  key: string,
  suffix: string,
  fallbackValue: number
): number {
  const value = getEnvironmentVariable(env, key, suffix);
  if (value === undefined || value === "") {
    return fallbackValue;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function parseIntegerPageValue(
  env: Env,
  key: string,
  suffix: string,
  fallbackValue: number
): number {
  const value = getEnvironmentVariable(env, key, suffix);
  if (value === undefined || value === "") {
    return fallbackValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function parseNonNegativeIntegerEnvironmentVariable(
  env: Env,
  key: string,
  fallbackValue: number
): number {
  const parsed = parseIntegerEnvironmentVariable(env, key, fallbackValue);
  return parsed >= 0 ? parsed : fallbackValue;
}

function parseImageFormat(value: string | undefined): ImageFormat {
  const normalizedValue = String(value ?? "png").toLowerCase();
  if (
    normalizedValue === "png" ||
    normalizedValue === "jpeg" ||
    normalizedValue === "bmp"
  ) {
    return normalizedValue;
  }

  return "png";
}

function parseColorMode(value: string | undefined): ColorMode {
  return value === "TrueColor" ? "TrueColor" : "GrayScale";
}

function parsePreferredColorScheme(
  value: string | undefined
): PreferredColorScheme {
  return value === "dark" ? "dark" : "light";
}

function getPagesConfig(env: Env): readonly PageConfig[] {
  const pages: PageConfig[] = [];
  let pageNumber = 0;

  while (++pageNumber) {
    const suffix = pageNumber === 1 ? "" : `_${pageNumber}`;
    const screenShotUrl = env[`HA_SCREENSHOT_URL${suffix}`];
    if (!screenShotUrl) {
      return pages;
    }

    pages.push({
      screenShotUrl,
      imageFormat: parseImageFormat(
        getEnvironmentVariable(env, "IMAGE_FORMAT", suffix)
      ),
      outputPath:
        getEnvironmentVariable(
          env,
          "OUTPUT_PATH",
          suffix,
          `output/cover${suffix}`
        ) ?? `output/cover${suffix}`,
      renderingDelay: parseIntegerPageValue(
        env,
        "RENDERING_DELAY",
        suffix,
        0
      ),
      renderingScreenSize: {
        height: parseIntegerPageValue(
          env,
          "RENDERING_SCREEN_HEIGHT",
          suffix,
          800
        ),
        width: parseIntegerPageValue(env, "RENDERING_SCREEN_WIDTH", suffix, 600)
      },
      grayscaleDepth: parseIntegerPageValue(env, "GRAYSCALE_DEPTH", suffix, 8),
      removeGamma:
        getEnvironmentVariable(env, "REMOVE_GAMMA", suffix) === "true",
      blackLevel:
        getEnvironmentVariable(env, "BLACK_LEVEL", suffix, "0%") ?? "0%",
      whiteLevel:
        getEnvironmentVariable(env, "WHITE_LEVEL", suffix, "100%") ?? "100%",
      dither: getEnvironmentVariable(env, "DITHER", suffix) === "true",
      colorMode: parseColorMode(
        getEnvironmentVariable(env, "COLOR_MODE", suffix)
      ),
      prefersColorScheme: parsePreferredColorScheme(
        getEnvironmentVariable(env, "PREFERS_COLOR_SCHEME", suffix)
      ),
      rotation: parseIntegerPageValue(env, "ROTATION", suffix, 0),
      scaling: parseFloatEnvironmentVariable(env, "SCALING", suffix, 1),
      batteryWebHook:
        getEnvironmentVariable(env, "HA_BATTERY_WEBHOOK", suffix) ?? null,
      saturation: parseFloatEnvironmentVariable(env, "SATURATION", suffix, 1),
      contrast: parseFloatEnvironmentVariable(env, "CONTRAST", suffix, 1)
    });
  }

  return pages;
}

export function loadConfig(env: Env = process.env): AppConfig {
  const browserCacheTtlSeconds = parseNonNegativeIntegerEnvironmentVariable(
    env,
    "BROWSER_CACHE_TTL_SECONDS",
    DEFAULT_BROWSER_CACHE_TTL_SECONDS
  );

  return {
    baseUrl: env["HA_BASE_URL"],
    accessToken: env["HA_ACCESS_TOKEN"],
    cronJob: env["CRON_JOB"] ?? "* * * * *",
    useImageMagick: env["USE_IMAGE_MAGICK"] === "true",
    pages: getPagesConfig(env),
    port: parseIntegerEnvironmentVariable(env, "PORT", 5000),
    renderingTimeout: parseIntegerEnvironmentVariable(
      env,
      "RENDERING_TIMEOUT",
      10000
    ),
    browserLaunchTimeout: parseIntegerEnvironmentVariable(
      env,
      "BROWSER_LAUNCH_TIMEOUT",
      30000
    ),
    browserCacheTtlSeconds,
    browserCacheTtl: browserCacheTtlSeconds * 1000,
    language: env["LANGUAGE"] ?? "en",
    theme: env["HA_THEME"] ? { theme: env["HA_THEME"] } : null,
    debug: env["DEBUG"] === "true",
    ignoreCertificateErrors:
      env["UNSAFE_IGNORE_CERTIFICATE_ERRORS"] === "true",
    httpAuthUser: env["HTTP_AUTH_USER"] ?? null,
    httpAuthPassword: env["HTTP_AUTH_PASSWORD"] ?? null
  };
}
