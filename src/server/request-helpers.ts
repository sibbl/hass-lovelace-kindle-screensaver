import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { RenderResult } from "../types";

export interface RenderTarget {
  pageNumber: number | null;
}

export function hasTruthyFlag(
  searchParams: URLSearchParams,
  name: string
): boolean {
  if (!searchParams.has(name)) {
    return false;
  }

  const value = String(searchParams.get(name) || "").toLowerCase();
  return !["0", "false", "no", "off"].includes(value);
}

export function parseRenderTarget(pathname: string): RenderTarget | null {
  if (pathname === "/render") {
    return { pageNumber: null };
  }

  const match = pathname.match(/^\/render\/(\d+)$/);
  const pageNumberValue = match?.[1];
  if (!pageNumberValue) {
    return null;
  }

  const pageNumber = Number.parseInt(pageNumberValue, 10);
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return null;
  }

  return { pageNumber };
}

export function getOperationHeaders(
  renderResult: RenderResult | null,
  cacheClearResult: RenderResult | null
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};

  if (renderResult) {
    headers["X-Render-Status"] = renderResult.status;
    if (renderResult.status === "failed") {
      headers["X-Render-Error"] = sanitizeHeaderValue(renderResult.error);
    }
  }

  if (cacheClearResult) {
    headers["X-Cache-Clear-Status"] = cacheClearResult.status;
    if (cacheClearResult.status === "failed") {
      headers["X-Cache-Clear-Error"] = sanitizeHeaderValue(
        cacheClearResult.error
      );
    }
  }

  return headers;
}

export function sanitizeHeaderValue(value: unknown): string {
  return String(value).replace(/[\r\n]/g, " ").slice(0, 256);
}

export function writeJsonResponse(
  response: ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-cache"
  });
  response.end(body);
}
