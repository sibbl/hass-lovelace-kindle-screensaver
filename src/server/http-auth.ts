import { parseRequestRoute } from "./request-routing";
import type { ServerResponse } from "node:http";
import type { PageConfig } from "../types";

type HttpAuthConfig = Pick<PageConfig, "httpAuthUser" | "httpAuthPassword">;

const unauthorizedHeaders = {
  "WWW-Authenticate": 'Basic realm="hass-lovelace-kindle-screensaver"',
};

export function getHttpAuthForRequest(
  pathname: string,
  pages: PageConfig[],
): HttpAuthConfig | null {
  const route = parseRequestRoute(pathname);
  if (!route) return null;
  const pageNumber = "pageNumber" in route ? (route.pageNumber ?? 1) : 1;
  return pages[pageNumber - 1] ?? null;
}

export function isHttpRequestAuthorized(
  authHeader: string | undefined,
  authConfig: HttpAuthConfig | null,
): boolean {
  if (!authConfig) return false;
  if (!authConfig.httpAuthUser || !authConfig.httpAuthPassword) {
    return true;
  }
  if (!authHeader?.startsWith("Basic ")) {
    return false;
  }

  const credentials = Buffer.from(authHeader.slice(6), "base64").toString();
  const [user = "", ...passwordParts] = credentials.split(":");
  const password = passwordParts.join(":");
  return user === authConfig.httpAuthUser && password === authConfig.httpAuthPassword;
}

export function writeUnauthorizedResponse(response: ServerResponse): void {
  response.writeHead(401, unauthorizedHeaders);
  response.end("Unauthorized");
}
