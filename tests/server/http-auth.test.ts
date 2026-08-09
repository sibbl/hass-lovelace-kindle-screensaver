import { describe, expect, it } from "vitest";
import {
  getHttpAuthForRequest,
  isHttpRequestAuthorized
} from "../../src/server/http-auth";
import { createPageConfig } from "../fixtures";

const pages = [
  createPageConfig({
    httpAuthUser: "first-user",
    httpAuthPassword: "first-password"
  }),
  createPageConfig({
    httpAuthUser: "second-user",
    httpAuthPassword: "second-password"
  }),
  createPageConfig({
    httpAuthUser: "third-user",
    httpAuthPassword: "third:password"
  })
];

function basicAuth(user: string, password: string): string {
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
      isHttpRequestAuthorized(
        basicAuth("third-user", "third:password"),
        authConfig
      )
    ).toBe(true);
    expect(
      isHttpRequestAuthorized(
        basicAuth("first-user", "first-password"),
        authConfig
      )
    ).toBe(false);
  });

  it("leaves pages without a complete credential pair public", () => {
    const publicPage = createPageConfig();
    const incompletePage = createPageConfig({ httpAuthUser: "user" });

    expect(isHttpRequestAuthorized(undefined, publicPage)).toBe(true);
    expect(isHttpRequestAuthorized(undefined, incompletePage)).toBe(true);
  });
});
