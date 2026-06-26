export class OperationTimeoutError extends Error {
  constructor(
    readonly description: string,
    readonly timeoutMs: number
  ) {
    super(`${description} timed out after ${timeoutMs}ms`);
    this.name = "OperationTimeoutError";
  }
}

export class OperationAbortedError extends Error {
  constructor(readonly description: string) {
    super(`${description} aborted`);
    this.name = "OperationAbortedError";
  }
}

export function withTimeout<TValue>(
  promise: Promise<TValue>,
  timeoutMs: number,
  description: string,
  onTimeout?: () => void
): Promise<TValue> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<TValue>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout?.();
      reject(new OperationTimeoutError(description, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

export function throwIfAborted(
  signal: AbortSignal | undefined,
  description: string
): void {
  if (signal?.aborted === true) {
    throw new OperationAbortedError(description);
  }
}

export function waitForAbortableTimeout(
  timeoutMs: number,
  signal: AbortSignal | undefined,
  description: string
): Promise<void> {
  throwIfAborted(signal, description);

  return new Promise<void>((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;
    const onAbort = (): void => {
      clearTimeout(timeoutId);
      reject(new OperationAbortedError(description));
    };

    timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, timeoutMs);

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted === true) {
      onAbort();
    }
  });
}
