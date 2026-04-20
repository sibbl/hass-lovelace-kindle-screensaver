const { loadConfig } = require("./config");
const { createHttpServer } = require("./server");
const { renderAndConvertAsync } = require("./renderer");

function validateConfig(config) {
  const errors = [];

  if (config.pages.length === 0) {
    errors.push("Please check your configuration");
    return errors;
  }

  if (!config.baseUrl || config.baseUrl.trim() === "") {
    errors.push("ERROR: HA_BASE_URL is not configured.");
    return errors;
  }

  const placeholderPatterns = [
    "your-path-to-home-assistant",
    "your-hass-instance",
    "your-home-assistant",
    "example.com",
  ];

  const baseUrlLower = config.baseUrl.toLowerCase();
  for (const pattern of placeholderPatterns) {
    if (baseUrlLower.includes(pattern)) {
      errors.push(
        `ERROR: HA_BASE_URL contains placeholder text: "${config.baseUrl}"`
      );
      return errors;
    }
  }

  if (!config.accessToken || config.accessToken.trim() === "") {
    errors.push("ERROR: HA_ACCESS_TOKEN is not configured.");
    return errors;
  }

  for (const i in config.pages) {
    const pageConfig = config.pages[i];
    if (pageConfig.rotation % 90 > 0) {
      errors.push(
        `Invalid rotation value for entry ${Number(i) + 1}: ${pageConfig.rotation}`
      );
    }
  }

  return errors;
}

module.exports = {
  loadConfig,
  createHttpServer,
  renderAndConvertAsync,
  validateConfig,
};
