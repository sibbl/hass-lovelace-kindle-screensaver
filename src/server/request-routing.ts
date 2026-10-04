export type RequestRoute =
  | { type: "health" | "cache" }
  | { type: "image"; pageNumber: number }
  | { type: "render"; pageNumber: number | null };

// Authorization and execution must agree on canonical page paths.
export function parseRequestRoute(pathname: string): RequestRoute | null {
  if (pathname === "/health") return { type: "health" };
  if (pathname === "/cache/clear") return { type: "cache" };
  if (pathname === "/render") return { type: "render", pageNumber: null };
  if (pathname === "/") return { type: "image", pageNumber: 1 };
  const match = /^\/(render\/)?([1-9]\d*)$/.exec(pathname);
  if (!match) return null;
  const pageNumber = Number(match[2]);
  if (!Number.isSafeInteger(pageNumber)) return null;
  return { type: match[1] ? "render" : "image", pageNumber };
}
