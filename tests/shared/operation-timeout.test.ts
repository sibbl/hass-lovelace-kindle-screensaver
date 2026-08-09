import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationTimeoutError, withTimeout } from "../../src/shared/operation-timeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("operation timeout", () => {
  it("returns the operation result before the timeout", async () => {
    await expect(withTimeout(Promise.resolve("finished"), 1000, "quick operation")).resolves.toBe(
      "finished",
    );
  });

  it("preserves operation errors", async () => {
    const operationError = new Error("operation failed");
    await expect(
      withTimeout(Promise.reject(operationError), 1000, "failed operation"),
    ).rejects.toBe(operationError);
  });

  it("rejects with structured timeout details and invokes the callback", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const result = withTimeout(
      new Promise<never>(() => undefined),
      250,
      "slow operation",
      onTimeout,
    );
    await Promise.all([
      expect(result).rejects.toMatchObject({
        name: "OperationTimeoutError",
        description: "slow operation",
        timeoutMs: 250,
        message: "slow operation timed out after 250ms",
      }),
      vi.advanceTimersByTimeAsync(250),
    ]);
    expect(onTimeout).toHaveBeenCalledOnce();
    expect(new OperationTimeoutError("test", 5)).toBeInstanceOf(Error);
  });
});
