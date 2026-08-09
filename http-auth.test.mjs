import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { getHttpAuthForRequest, isHttpRequestAuthorized } = require("./http-auth");

const pages = [
  { httpAuthUser: "first-user", httpAuthPassword: "first-password" },
  { httpAuthUser: "second-user", httpAuthPassword: "second-password" },
  { httpAuthUser: "third-user", httpAuthPassword: "third:password" }
];

function basicAuth(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

describe("HTTP auth", () => {
  it("selects numbered credentials for image and page render requests", () => {
    expect(getHttpAuthForRequest("/3", pages)).toBe(pages[2]);
    expect(getHttpAuthForRequest("/render/3", pages)).toBe(pages[2]);
    expect(getHttpAuthForRequest("/render", pages)).toBe(pages[0]);
    expect(getHttpAuthForRequest("/cache/clear", pages)).toBe(pages[0]);
  });

  it("authorizes a numbered page with its own username and password", () => {
    const authConfig = getHttpAuthForRequest("/3", pages);

    expect(
      isHttpRequestAuthorized(basicAuth("third-user", "third:password"), authConfig)
    ).toBe(true);
    expect(
      isHttpRequestAuthorized(
        basicAuth("first-user", "first-password"),
        authConfig
      )
    ).toBe(false);
  });

  it("leaves pages without a complete credential pair public", () => {
    expect(isHttpRequestAuthorized(undefined, {})).toBe(true);
    expect(
      isHttpRequestAuthorized(undefined, { httpAuthUser: "user" })
    ).toBe(true);
  });
});
