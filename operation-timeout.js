class OperationTimeoutError extends Error {
  constructor(description, timeoutMs) {
    super(`${description} timed out after ${timeoutMs}ms`);
    this.name = "OperationTimeoutError";
    this.description = description;
    this.timeoutMs = timeoutMs;
  }
}

function withTimeout(promise, timeoutMs, description, onTimeout) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      if (onTimeout) {
        onTimeout();
      }
      reject(new OperationTimeoutError(description, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

module.exports = {
  OperationTimeoutError,
  withTimeout
};
