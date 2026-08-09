export class OperationTimeoutError extends Error {
  public readonly description: string;
  public readonly timeoutMs: number;

  public constructor(description: string, timeoutMs: number) {
    super(`${description} timed out after ${timeoutMs}ms`);
    this.name = "OperationTimeoutError";
    this.description = description;
    this.timeoutMs = timeoutMs;
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  description: string,
  onTimeout?: () => void
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout?.();
      reject(new OperationTimeoutError(description, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}
