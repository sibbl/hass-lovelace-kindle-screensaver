import { CronTime } from "cron";
import type { AppConfig, Logger } from "../types";

export function getRenderJobTimeout(config: AppConfig): number {
  const pageTimeoutBudget = config.pages.reduce(
    (total, pageConfig) =>
      total + config.renderingTimeout + pageConfig.renderingDelay + 30000,
    0
  );

  return Math.max(pageTimeoutBudget, config.renderingTimeout + 30000);
}

export function getHealthcheckMaxAge(
  config: AppConfig,
  renderJobTimeout: number,
  logger: Logger = console
): number {
  const defaultCronInterval = 60000;

  try {
    const nextDates = new CronTime(config.cronJob).sendAt(2);
    if (Array.isArray(nextDates) && nextDates.length >= 2) {
      const firstDate = nextDates[0];
      const secondDate = nextDates[1];
      if (firstDate && secondDate) {
        const cronInterval = secondDate.valueOf() - firstDate.valueOf();
        if (Number.isFinite(cronInterval) && cronInterval > 0) {
          return cronInterval + renderJobTimeout;
        }
      }
    }
  } catch (error: unknown) {
    logger.error(
      "Failed to derive healthcheck age from cron, using fallback:",
      error
    );
  }

  return defaultCronInterval + renderJobTimeout;
}
