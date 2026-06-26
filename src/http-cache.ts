import type { IncomingHttpHeaders } from "http";

function parseHttpDate(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function firstHeaderValue(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return value?.[0];
}

function normalizeEtag(etag: string): string {
  return etag.trim();
}

function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) {
    return false;
  }

  if (ifNoneMatch.trim() === "*") {
    return true;
  }

  return ifNoneMatch
    .split(",")
    .map(normalizeEtag)
    .includes(normalizeEtag(etag));
}

export function shouldReturnNotModified(
  headers: IncomingHttpHeaders,
  etag: string,
  modifiedTimeMs: number
): boolean {
  if (etagMatches(firstHeaderValue(headers["if-none-match"]), etag)) {
    return true;
  }

  const ifModifiedSince = parseHttpDate(
    firstHeaderValue(headers["if-modified-since"])
  );
  if (ifModifiedSince === null) {
    return false;
  }

  return Math.floor(modifiedTimeMs / 1000) <= Math.floor(ifModifiedSince / 1000);
}
