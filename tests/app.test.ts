import { describe, expect, it, vi } from "vitest";
import { startApplication } from "../src/app";
import { createAppConfig } from "./fixtures";

describe("application startup", () => {
  it("stops before starting services when configuration is invalid", () => {
    const logger = { log: vi.fn(), error: vi.fn() };

    const application = startApplication(createAppConfig({ pages: [] }), logger);

    expect(application).toBeNull();
    expect(logger.error).toHaveBeenCalledWith("Please check your configuration");
    expect(logger.log).not.toHaveBeenCalled();
  });
});
