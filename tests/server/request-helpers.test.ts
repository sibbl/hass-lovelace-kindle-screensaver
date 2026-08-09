import { describe, expect, it } from "vitest";
import {
  getOperationHeaders,
  hasTruthyFlag,
  parseRenderTarget,
  sanitizeHeaderValue
} from "../../src/server/request-helpers";

describe("request helpers", () => {
  it("parses all-page and numbered render targets", () => {
    expect(parseRenderTarget("/render")).toEqual({ pageNumber: null });
    expect(parseRenderTarget("/render/2")).toEqual({ pageNumber: 2 });
    expect(parseRenderTarget("/render/0")).toBeNull();
    expect(parseRenderTarget("/render/not-a-page")).toBeNull();
  });

  it("recognizes truthy query flags while honoring common false values", () => {
    expect(hasTruthyFlag(new URLSearchParams("refresh"), "refresh")).toBe(true);
    expect(hasTruthyFlag(new URLSearchParams("refresh=yes"), "refresh")).toBe(
      true
    );
    for (const value of ["0", "false", "no", "off"]) {
      expect(
        hasTruthyFlag(new URLSearchParams(`refresh=${value}`), "refresh")
      ).toBe(false);
    }
  });

  it("adds render and cache-clear status headers", () => {
    expect(
      getOperationHeaders(
        { status: "failed", error: "render failed" },
        { status: "ok" }
      )
    ).toEqual({
      "X-Render-Status": "failed",
      "X-Render-Error": "render failed",
      "X-Cache-Clear-Status": "ok"
    });
  });

  it("removes line breaks and bounds error header values", () => {
    expect(sanitizeHeaderValue("first\r\nsecond")).toBe("first  second");
    expect(sanitizeHeaderValue("x".repeat(300))).toHaveLength(256);
  });
});
