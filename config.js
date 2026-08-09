function getEnvironmentVariable(key, suffix, fallbackValue) {
  const value = process.env[key + suffix];
  if (value !== undefined) return value;
  return fallbackValue || process.env[key];
}

function parseIntegerEnvironmentVariable(key, fallbackValue) {
  const value = process.env[key];
  if (value === undefined || value === "") return fallbackValue;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function parseNonNegativeIntegerEnvironmentVariable(key, fallbackValue) {
  const parsed = parseIntegerEnvironmentVariable(key, fallbackValue);
  return parsed >= 0 ? parsed : fallbackValue;
}

const browserCacheTtlSeconds = parseNonNegativeIntegerEnvironmentVariable(
  "BROWSER_CACHE_TTL_SECONDS",
  86400
);

function getPagesConfig() {
  const pages = [];
  let i = 0;
  while (++i) {
    const suffix = i === 1 ? "" : `_${i}`;
    const screenShotUrl = process.env[`HA_SCREENSHOT_URL${suffix}`];
    if (!screenShotUrl) return pages;
    const theme = getEnvironmentVariable("HA_THEME", suffix);
    pages.push({
      baseUrl: getEnvironmentVariable("HA_BASE_URL", suffix),
      accessToken: getEnvironmentVariable("HA_ACCESS_TOKEN", suffix),
      screenShotUrl,
      language: getEnvironmentVariable("LANGUAGE", suffix) || "en",
      theme: theme ? { theme } : null,
      imageFormat: getEnvironmentVariable("IMAGE_FORMAT", suffix) || "png",
      outputPath: getEnvironmentVariable(
        "OUTPUT_PATH",
        suffix,
        `output/cover${suffix}`
      ),
      renderingDelay: getEnvironmentVariable("RENDERING_DELAY", suffix) || 0,
      renderingScreenSize: {
        height:
          getEnvironmentVariable("RENDERING_SCREEN_HEIGHT", suffix) || 800,
        width: getEnvironmentVariable("RENDERING_SCREEN_WIDTH", suffix) || 600,
      },
      grayscaleDepth: getEnvironmentVariable("GRAYSCALE_DEPTH", suffix) || 8,
      removeGamma: getEnvironmentVariable("REMOVE_GAMMA", suffix) === "true" || false,
      blackLevel: getEnvironmentVariable("BLACK_LEVEL", suffix) || "0%",
      whiteLevel: getEnvironmentVariable("WHITE_LEVEL", suffix) || "100%",
      dither: getEnvironmentVariable("DITHER", suffix) === "true" || false,
      colorMode: getEnvironmentVariable("COLOR_MODE", suffix) || "GrayScale",
      prefersColorScheme: getEnvironmentVariable("PREFERS_COLOR_SCHEME", suffix) || "light",
      rotation: getEnvironmentVariable("ROTATION", suffix) || 0,
      scaling: getEnvironmentVariable("SCALING", suffix) || 1,
      batteryWebHook: getEnvironmentVariable("HA_BATTERY_WEBHOOK", suffix) || null,
      saturation: getEnvironmentVariable("SATURATION", suffix) || 1,
      contrast: getEnvironmentVariable("CONTRAST", suffix) || 1,
      httpAuthUser: getEnvironmentVariable("HTTP_AUTH_USER", suffix) || null,
      httpAuthPassword:
        getEnvironmentVariable("HTTP_AUTH_PASSWORD", suffix) || null,
    });
  }
  return pages;
}

module.exports = {
  // Keep these top-level values for backwards compatibility. Rendering uses the
  // resolved values on each page, which may override them with a numbered env var.
  baseUrl: process.env.HA_BASE_URL,
  accessToken: process.env.HA_ACCESS_TOKEN,
  cronJob: process.env.CRON_JOB || "* * * * *",
  useImageMagick: process.env.USE_IMAGE_MAGICK === "true",
  pages: getPagesConfig(),
  port: process.env.PORT || 5000,
  renderingTimeout: parseIntegerEnvironmentVariable("RENDERING_TIMEOUT", 10000),
  browserLaunchTimeout: parseIntegerEnvironmentVariable("BROWSER_LAUNCH_TIMEOUT", 30000),
  browserCacheTtlSeconds,
  browserCacheTtl: browserCacheTtlSeconds * 1000,
  language: process.env.LANGUAGE || "en",
  theme: process.env.HA_THEME ? { theme: process.env.HA_THEME } : null,
  debug: process.env.DEBUG === "true",
  ignoreCertificateErrors:
    process.env.UNSAFE_IGNORE_CERTIFICATE_ERRORS === "true",
  httpAuthUser: process.env.HTTP_AUTH_USER || null,
  httpAuthPassword: process.env.HTTP_AUTH_PASSWORD || null,
};
