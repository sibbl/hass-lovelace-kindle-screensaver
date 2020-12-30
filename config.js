module.exports = {
  baseUrl: process.env.HA_BASE_URL,
  screenShotUrl: process.env.HA_SCREENSHOT_URL || "",
  accessToken: process.env.HA_ACCESS_TOKEN,
  cronJob: process.env.CRON_JOB || "* * * * *",
  outputPath: process.env.OUTPUT_PATH || "output/cover.png",
  renderingTimeout: process.env.RENDERING_TIMEOUT || 10000,
  renderingDelay: process.env.RENDERING_DELAY || 0,
  renderingScreenSize: {
    height: process.env.RENDERING_SCREEN_HEIGHT || 800,
    width: process.env.RENDERING_SCREEN_WIDTH || 600,
  },
  grayscaleDepth: process.env.GRAYSCALE_DEPTH || 8,
  useImageMagick: process.env.USE_IMAGE_MAGICK === "true",
  port: process.env.PORT || 5000,
  language: process.env.LANGUAGE || "en",
  rotation: process.env.ROTATION || 0,
  scaling: process.env.SCALING || 1,
  debug: process.env.DEBUG === "true"
};
