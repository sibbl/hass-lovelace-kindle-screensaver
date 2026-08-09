import type { IncomingHttpHeaders } from "node:http";

function getHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(",") : (value ?? "");
}

function parseHttpDate(value: string | string[] | undefined): number | null {
  const normalizedValue = getHeaderValue(value);
  if (!normalizedValue) {
    return null;
  }

  const time = Date.parse(normalizedValue);
  return Number.isFinite(time) ? time : null;
}

function normalizeEtag(etag: string | undefined): string {
  return String(etag || "").trim();
}

function etagMatches(ifNoneMatch: string | string[] | undefined, etag: string): boolean {
  const normalizedHeader = getHeaderValue(ifNoneMatch);
  if (!normalizedHeader) {
    return false;
  }

  if (normalizedHeader.trim() === "*") {
    return true;
  }

  return normalizedHeader.split(",").map(normalizeEtag).includes(normalizeEtag(etag));
}

export function shouldReturnNotModified(
  headers: IncomingHttpHeaders,
  etag: string,
  modifiedTimeMs: number,
): boolean {
  if (etagMatches(headers["if-none-match"], etag)) {
    return true;
  }

  const ifModifiedSince = parseHttpDate(headers["if-modified-since"]);
  if (ifModifiedSince === null) {
    return false;
  }

  return Math.floor(modifiedTimeMs / 1000) <= Math.floor(ifModifiedSince / 1000);
}
