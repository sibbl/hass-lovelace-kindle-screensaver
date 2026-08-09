import type { ServerResponse } from "node:http";
import type { PageConfig } from "../types";

type HttpAuthConfig = Pick<PageConfig, "httpAuthUser" | "httpAuthPassword">;

const unauthorizedHeaders = {
  "WWW-Authenticate": 'Basic realm="hass-lovelace-kindle-screensaver"'
};

function getPageNumberForRequest(pathname: string): number {
  if (pathname === "/") {
    return 1;
  }

  const match = /^\/(?:render\/)?([1-9]\d*)$/.exec(pathname);
  return match?.[1] ? Number.parseInt(match[1], 10) : 1;
}

export function getHttpAuthForRequest(
  pathname: string,
  pages: PageConfig[]
): HttpAuthConfig {
  const pageNumber = getPageNumberForRequest(pathname);
  return pages[pageNumber - 1] ?? pages[0] ?? {
    httpAuthUser: null,
    httpAuthPassword: null
  };
}

export function isHttpRequestAuthorized(
  authHeader: string | undefined,
  authConfig: HttpAuthConfig
): boolean {
  if (!authConfig.httpAuthUser || !authConfig.httpAuthPassword) {
    return true;
  }
  if (!authHeader?.startsWith("Basic ")) {
    return false;
  }

  const credentials = Buffer.from(authHeader.slice(6), "base64").toString();
  const [user = "", ...passwordParts] = credentials.split(":");
  const password = passwordParts.join(":");
  return (
    user === authConfig.httpAuthUser &&
    password === authConfig.httpAuthPassword
  );
}

export function writeUnauthorizedResponse(response: ServerResponse): void {
  response.writeHead(401, unauthorizedHeaders);
  response.end("Unauthorized");
}
