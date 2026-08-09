import { describe, expect, it, vi } from "vitest";
import {
  getHealthcheckMaxAge,
  getRenderJobTimeout
} from "../../src/scheduling/timing";
import { createAppConfig, createPageConfig } from "../fixtures";

describe("render timing", () => {
  it("budgets timeout and delay for every page", () => {
    const config = createAppConfig({
      renderingTimeout: 10000,
      pages: [
        createPageConfig({ renderingDelay: 1000 }),
        createPageConfig({ renderingDelay: 2000 })
      ]
    });

    expect(getRenderJobTimeout(config)).toBe(83000);
  });

  it("falls back to one minute when the cron expression is invalid", () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const config = createAppConfig({ cronJob: "invalid cron" });

    expect(getHealthcheckMaxAge(config, 40000, logger)).toBe(100000);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
