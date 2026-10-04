import { describe, expect, it } from "vitest";
import { validateConfig } from "../../src/config/validate-config";
import { createAppConfig, createPageConfig } from "../fixtures";

describe("configuration validation", () => {
  it("accepts a complete configuration", () => {
    expect(validateConfig(createAppConfig())).toEqual([]);
  });

  it("requires at least one screenshot page", () => {
    expect(validateConfig(createAppConfig({ pages: [] }))).toEqual([
      "Please check your configuration",
    ]);
  });

  it("identifies a missing numbered instance URL", () => {
    const config = createAppConfig({
      pages: [
        createPageConfig(),
        createPageConfig({ baseUrl: "", screenShotUrl: "/lovelace/second" }),
      ],
    });

    expect(validateConfig(config)[0]).toBe("ERROR: HA_BASE_URL_2 is not configured.");
  });

  it("rejects placeholder URLs", () => {
    const config = createAppConfig({
      pages: [
        createPageConfig({
          baseUrl: "https://your-home-assistant.example.com:8123",
        }),
      ],
    });

    expect(validateConfig(config)[0]).toContain("contains placeholder text");
  });

  it("rejects rotations that are not multiples of 90 degrees", () => {
    const config = createAppConfig({
      pages: [createPageConfig({ rotation: 45 })],
    });

    expect(validateConfig(config)).toEqual(["Invalid rotation value for entry 1: 45"]);
  });
});
