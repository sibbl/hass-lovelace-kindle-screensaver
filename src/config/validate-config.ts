import type { AppConfig } from "../types";

const PLACEHOLDER_PATTERNS = [
  "your-path-to-home-assistant",
  "your-hass-instance",
  "your-home-assistant",
  "example.com"
];

export function validateConfig(config: AppConfig): string[] {
  if (config.pages.length === 0) {
    return ["Please check your configuration"];
  }

  for (const [pageIndex, pageConfig] of config.pages.entries()) {
    const suffix = pageIndex === 0 ? "" : `_${pageIndex + 1}`;
    const baseUrlVariable = `HA_BASE_URL${suffix}`;
    const accessTokenVariable = `HA_ACCESS_TOKEN${suffix}`;

    if (pageConfig.baseUrl.trim() === "") {
      return [
        `ERROR: ${baseUrlVariable} is not configured.`,
        `Please set ${baseUrlVariable} to the Home Assistant instance URL for page ${pageIndex + 1}.`,
        "Example: https://homeassistant.local:8123 or http://192.168.1.100:8123"
      ];
    }

    const baseUrlLower = pageConfig.baseUrl.toLowerCase();
    if (PLACEHOLDER_PATTERNS.some((pattern) => baseUrlLower.includes(pattern))) {
      return [
        `ERROR: ${baseUrlVariable} contains placeholder text: "${pageConfig.baseUrl}"`,
        `Please update ${baseUrlVariable} to the actual Home Assistant instance URL.`,
        "Examples:",
        "  - https://homeassistant.local:8123",
        "  - http://192.168.1.100:8123",
        "  - https://my-home.duckdns.org:8123"
      ];
    }

    if (pageConfig.accessToken.trim() === "") {
      return [
        `ERROR: ${accessTokenVariable} is not configured.`,
        "Please create a long-lived access token in Home Assistant:",
        "  1. Go to your Home Assistant profile",
        "  2. Scroll down to 'Long-Lived Access Tokens'",
        "  3. Click 'Create Token'",
        `  4. Copy the token and set it as ${accessTokenVariable}`
      ];
    }

    if (pageConfig.rotation % 90 > 0) {
      return [
        `Invalid rotation value for entry ${pageIndex + 1}: ${pageConfig.rotation}`
      ];
    }
  }

  return [];
}
