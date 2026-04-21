import { describe, it, expect } from "vitest";
import { validateConfig } from "../../src/validate";

function makeValidConfig(overrides) {
  return {
    baseUrl: "http://ha.local:8123",
    accessToken: "test-token-abc123",
    httpAuthUser: null,
    httpAuthPassword: null,
    pages: [
      {
        screenShotUrl: "/lovelace/0",
        rotation: 0,
        imageFormat: "png",
        outputPath: "output/cover",
      },
    ],
    ...overrides,
  };
}

describe("validateConfig", () => {
  it("should return no errors for valid config", () => {
    const errors = validateConfig(makeValidConfig());
    expect(errors).toHaveLength(0);
  });

  it("should return error when pages is empty", () => {
    const errors = validateConfig(makeValidConfig({ pages: [] }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Please check your configuration");
  });

  it("should return error when baseUrl is missing", () => {
    const errors = validateConfig(makeValidConfig({ baseUrl: undefined }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("HA_BASE_URL is not configured");
  });

  it("should return error when baseUrl is empty string", () => {
    const errors = validateConfig(makeValidConfig({ baseUrl: "" }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("HA_BASE_URL is not configured");
  });

  it("should return error when baseUrl is whitespace", () => {
    const errors = validateConfig(makeValidConfig({ baseUrl: "   " }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("HA_BASE_URL is not configured");
  });

  it("should return error when baseUrl contains placeholder 'your-path-to-home-assistant'", () => {
    const errors = validateConfig(
      makeValidConfig({
        baseUrl: "https://your-path-to-home-assistant:8123",
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("placeholder text");
  });

  it("should return error when baseUrl contains placeholder 'your-hass-instance'", () => {
    const errors = validateConfig(makeValidConfig({ baseUrl: "https://your-hass-instance:8123" }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("placeholder text");
  });

  it("should return error when baseUrl contains placeholder 'your-home-assistant'", () => {
    const errors = validateConfig(
      makeValidConfig({
        baseUrl: "https://your-home-assistant.local:8123",
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("placeholder text");
  });

  it("should return error when baseUrl contains 'example.com'", () => {
    const errors = validateConfig(makeValidConfig({ baseUrl: "https://example.com:8123" }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("placeholder text");
  });

  it("should return error when accessToken is missing", () => {
    const errors = validateConfig(makeValidConfig({ accessToken: undefined }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("HA_ACCESS_TOKEN is not configured");
  });

  it("should return error when accessToken is empty string", () => {
    const errors = validateConfig(makeValidConfig({ accessToken: "" }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("HA_ACCESS_TOKEN is not configured");
  });

  it("should return error when accessToken is whitespace", () => {
    const errors = validateConfig(makeValidConfig({ accessToken: "   " }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("HA_ACCESS_TOKEN is not configured");
  });

  it("should allow basic auth when both credentials are configured", () => {
    const errors = validateConfig(
      makeValidConfig({
        httpAuthUser: "kindle",
        httpAuthPassword: "secret",
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it("should return error when only HTTP_AUTH_USER is set", () => {
    const errors = validateConfig(
      makeValidConfig({
        httpAuthUser: "kindle",
        httpAuthPassword: null,
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("HTTP_AUTH_USER and HTTP_AUTH_PASSWORD must be set together");
  });

  it("should return error when only HTTP_AUTH_PASSWORD is set", () => {
    const errors = validateConfig(
      makeValidConfig({
        httpAuthUser: null,
        httpAuthPassword: "secret",
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("HTTP_AUTH_USER and HTTP_AUTH_PASSWORD must be set together");
  });

  it("should treat blank auth values as unset during validation", () => {
    const errors = validateConfig(
      makeValidConfig({
        httpAuthUser: "   ",
        httpAuthPassword: "secret",
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("HTTP_AUTH_USER and HTTP_AUTH_PASSWORD must be set together");
  });

  it("should return error for invalid rotation value", () => {
    const errors = validateConfig(
      makeValidConfig({
        pages: [
          {
            screenShotUrl: "/lovelace/0",
            rotation: 45,
            imageFormat: "png",
            outputPath: "output/cover",
          },
        ],
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Invalid rotation");
  });

  it("should accept valid rotation values (0, 90, 180, 270)", () => {
    for (const rotation of [0, 90, 180, 270]) {
      const errors = validateConfig(
        makeValidConfig({
          pages: [
            {
              screenShotUrl: "/lovelace/0",
              rotation,
              imageFormat: "png",
              outputPath: "output/cover",
            },
          ],
        }),
      );
      expect(errors).toHaveLength(0);
    }
  });

  it("should check rotation for multiple pages", () => {
    const errors = validateConfig(
      makeValidConfig({
        pages: [
          {
            screenShotUrl: "/lovelace/0",
            rotation: 0,
            imageFormat: "png",
            outputPath: "output/cover",
          },
          {
            screenShotUrl: "/lovelace/1",
            rotation: 45,
            imageFormat: "png",
            outputPath: "output/cover2",
          },
        ],
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("entry 2");
  });
});
