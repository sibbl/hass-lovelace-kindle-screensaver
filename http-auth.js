const { parseRequestRoute } = require("./request-routing");

const unauthorizedHeaders = {
  "WWW-Authenticate": 'Basic realm="hass-lovelace-kindle-screensaver"'
};

function getHttpAuthForRequest(pathname, pages) {
  const route = parseRequestRoute(pathname);
  // Invalid routes must never fall back to a potentially public first page.
  if (!route) return null;
  return pages[(route.pageNumber || 1) - 1] || null;
}

function isHttpRequestAuthorized(authHeader, authConfig) {
  if (!authConfig) return false;
  if (!authConfig.httpAuthUser || !authConfig.httpAuthPassword) return true;
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;

  const credentials = Buffer.from(authHeader.slice(6), "base64").toString();
  const [user, ...passwordParts] = credentials.split(":");
  const password = passwordParts.join(":");
  return (
    user === authConfig.httpAuthUser &&
    password === authConfig.httpAuthPassword
  );
}

function writeUnauthorizedResponse(response) {
  response.writeHead(401, unauthorizedHeaders);
  response.end("Unauthorized");
}

module.exports = {
  getHttpAuthForRequest,
  isHttpRequestAuthorized,
  writeUnauthorizedResponse
};
