class OperationTimeoutError extends Error {
  constructor(description, timeoutMs) {
    super(`${description} timed out after ${timeoutMs}ms`);
    this.name = "OperationTimeoutError";
    this.description = description;
    this.timeoutMs = timeoutMs;
  }
}

class OperationAbortedError extends Error {
  constructor(description) {
    super(`${description} aborted`);
    this.name = "OperationAbortedError";
    this.description = description;
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

function throwIfAborted(signal, description) {
  if (signal && signal.aborted) {
    throw new OperationAbortedError(description);
  }
}

function waitForAbortableTimeout(timeoutMs, signal, description) {
  throwIfAborted(signal, description);

  return new Promise((resolve, reject) => {
    let timeoutId;
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new OperationAbortedError(description));
    };

    timeoutId = setTimeout(() => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve();
    }, timeoutMs);

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
      }
    }
  });
}

module.exports = {
  OperationAbortedError,
  OperationTimeoutError,
  throwIfAborted,
  waitForAbortableTimeout,
  withTimeout
};
