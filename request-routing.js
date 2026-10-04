// Use exactly the same canonical paths for authorization and execution.
function parseRequestRoute(pathname) {
  if (pathname === "/health") return { type: "health" };
  if (pathname === "/cache/clear") return { type: "cache" };
  if (pathname === "/render") return { type: "render", pageNumber: null };
  if (pathname === "/") return { type: "image", pageNumber: 1 };

  const match = pathname.match(/^\/(render\/)?([1-9]\d*)$/);
  if (!match) return null;
  const pageNumber = Number(match[2]);
  if (!Number.isSafeInteger(pageNumber)) return null;
  return { type: match[1] ? "render" : "image", pageNumber };
}

module.exports = { parseRequestRoute };
