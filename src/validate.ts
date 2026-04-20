import type { AppConfig } from "./types";

const PLACEHOLDER_PATTERNS = [
  "your-path-to-home-assistant",
  "your-hass-instance",
  "your-home-assistant",
  "example.com",
] as const;

export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];

  if (config.pages.length === 0) {
    errors.push("Please check your configuration");
    return errors;
  }

  if (!config.baseUrl || config.baseUrl.trim() === "") {
    errors.push("ERROR: HA_BASE_URL is not configured.");
    return errors;
  }

  const baseUrlLower = config.baseUrl.toLowerCase();
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (baseUrlLower.includes(pattern)) {
      errors.push(`ERROR: HA_BASE_URL contains placeholder text: "${config.baseUrl}"`);
      return errors;
    }
  }

  if (!config.accessToken || config.accessToken.trim() === "") {
    errors.push("ERROR: HA_ACCESS_TOKEN is not configured.");
    return errors;
  }

  for (let i = 0; i < config.pages.length; i++) {
    const pageConfig = config.pages[i];
    if (pageConfig && pageConfig.rotation % 90 > 0) {
      errors.push(`Invalid rotation value for entry ${i + 1}: ${pageConfig.rotation}`);
    }
  }

  return errors;
}
