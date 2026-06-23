import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { shouldReturnNotModified } = require("./http-cache.js");

describe("HTTP cache validators", () => {
  it("matches If-None-Match against the current ETag", () => {
    expect(
      shouldReturnNotModified(
        { "if-none-match": '"old", "current"' },
        '"current"',
        Date.now()
      )
    ).toBe(true);
  });

  it("matches If-Modified-Since at second precision", () => {
    const modified = Date.UTC(2026, 0, 2, 3, 4, 5, 600);
    expect(
      shouldReturnNotModified(
        { "if-modified-since": new Date(modified).toUTCString() },
        '"current"',
        modified
      )
    ).toBe(true);
  });

  it("does not match stale validators", () => {
    const modified = Date.UTC(2026, 0, 2, 3, 4, 5);
    expect(
      shouldReturnNotModified(
        {
          "if-none-match": '"old"',
          "if-modified-since": new Date(modified - 1000).toUTCString()
        },
        '"current"',
        modified
      )
    ).toBe(false);
  });
});
