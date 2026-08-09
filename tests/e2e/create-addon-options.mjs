import { writeFile } from "node:fs/promises";
import process from "node:process";

const [
  outputPath,
  homeAssistantUrl,
  accessToken,
  httpAuthUser,
  httpAuthPassword,
  numberedHttpAuthUser,
  numberedHttpAuthPassword,
] = process.argv.slice(2);

if (
  !outputPath ||
  !homeAssistantUrl ||
  !accessToken ||
  !httpAuthUser ||
  !httpAuthPassword ||
  !numberedHttpAuthUser ||
  !numberedHttpAuthPassword
) {
  throw new Error(
    "Usage: create-addon-options.mjs <output> <HA URL> <access token> <HTTP auth user> <HTTP auth password> <numbered HTTP auth user> <numbered HTTP auth password>",
  );
}

const options = {
  HA_BASE_URL: homeAssistantUrl,
  HA_SCREENSHOT_URL: "/lovelace/0",
  HA_ACCESS_TOKEN: accessToken,
  HTTP_AUTH_USER: httpAuthUser,
  HTTP_AUTH_PASSWORD: httpAuthPassword,
  LANGUAGE: "en",
  CRON_JOB: "0 0 1 1 *",
  RENDERING_TIMEOUT: "60000",
  RENDERING_DELAY: "1000",
  RENDERING_SCREEN_HEIGHT: "800",
  RENDERING_SCREEN_WIDTH: "600",
  BROWSER_LAUNCH_TIMEOUT: "60000",
  BROWSER_CACHE_TTL_SECONDS: "86400",
  ROTATION: "0",
  SCALING: "1",
  GRAYSCALE_DEPTH: "8",
  IMAGE_FORMAT: "png",
  COLOR_MODE: "GrayScale",
  REMOVE_GAMMA: true,
  PREFERS_COLOR_SCHEME: "light",
  HA_BATTERY_WEBHOOK: "",
  SATURATION: 1,
  CONTRAST: 1,
  ADDITIONAL_ENV_VARS: [
    { name: "HA_SCREENSHOT_URL_2", value: "/lovelace/0" },
    { name: "OUTPUT_PATH_2", value: "/output/cover_2" },
    { name: "HTTP_AUTH_USER_2", value: numberedHttpAuthUser },
    { name: "HTTP_AUTH_PASSWORD_2", value: numberedHttpAuthPassword },
  ],
};

await writeFile(outputPath, `${JSON.stringify(options, null, 2)}\n`, { mode: 0o600 });
