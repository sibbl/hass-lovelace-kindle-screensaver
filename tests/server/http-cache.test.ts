import { describe, expect, it } from "vitest";
import { shouldReturnNotModified } from "../../src/server/http-cache";

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

  it("matches wildcards and ignores invalid dates", () => {
    expect(
      shouldReturnNotModified(
        { "if-none-match": "*" },
        '"current"',
        Date.now()
      )
    ).toBe(true);
    expect(
      shouldReturnNotModified(
        { "if-modified-since": "not a date" },
        '"current"',
        Date.now()
      )
    ).toBe(false);
  });
});
