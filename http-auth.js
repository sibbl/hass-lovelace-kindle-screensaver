const unauthorizedHeaders = {
  "WWW-Authenticate": 'Basic realm="hass-lovelace-kindle-screensaver"'
};

function getPageNumberForRequest(pathname) {
  if (pathname === "/") return 1;

  const match = pathname.match(/^\/(?:render\/)?([1-9]\d*)$/);
  return match ? parseInt(match[1], 10) : 1;
}

function getHttpAuthForRequest(pathname, pages) {
  const pageNumber = getPageNumberForRequest(pathname);
  return pages[pageNumber - 1] || pages[0] || {};
}

function isHttpRequestAuthorized(authHeader, authConfig) {
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
