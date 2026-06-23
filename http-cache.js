function parseHttpDate(value) {
  if (!value) {
    return null;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function normalizeEtag(etag) {
  return String(etag || "").trim();
}

function etagMatches(ifNoneMatch, etag) {
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

function shouldReturnNotModified(headers, etag, modifiedTimeMs) {
  if (etagMatches(headers["if-none-match"], etag)) {
    return true;
  }

  const ifModifiedSince = parseHttpDate(headers["if-modified-since"]);
  if (ifModifiedSince === null) {
    return false;
  }

  return Math.floor(modifiedTimeMs / 1000) <= Math.floor(ifModifiedSince / 1000);
}

module.exports = {
  shouldReturnNotModified
};
