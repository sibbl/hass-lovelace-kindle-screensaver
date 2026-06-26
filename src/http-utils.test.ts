import { describe, expect, it } from "vitest";
import {
  getOperationHeaders,
  hasTruthyFlag,
  parseRenderTarget,
  sanitizeHeaderValue
} from "./http-utils";

describe("HTTP utility helpers", () => {
  it("parses render targets", () => {
    expect(parseRenderTarget("/render")).toEqual({ pageNumber: null });
    expect(parseRenderTarget("/render/3")).toEqual({ pageNumber: 3 });
    expect(parseRenderTarget("/render/0")).toBeNull();
    expect(parseRenderTarget("/render/foo")).toBeNull();
  });

  it("parses truthy query flags", () => {
    expect(hasTruthyFlag(new URLSearchParams("refresh=1"), "refresh")).toBe(
      true
    );
    expect(hasTruthyFlag(new URLSearchParams("refresh=false"), "refresh")).toBe(
      false
    );
    expect(hasTruthyFlag(new URLSearchParams("refresh"), "refresh")).toBe(true);
  });

  it("sanitizes header values", () => {
    expect(sanitizeHeaderValue("first\r\nsecond")).toBe("first  second");
  });

  it("adds explicit operation failure headers", () => {
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
});
