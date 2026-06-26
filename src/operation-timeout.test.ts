import { describe, expect, it } from "vitest";
import {
  OperationAbortedError,
  OperationTimeoutError,
  waitForAbortableTimeout,
  withTimeout
} from "./operation-timeout";

describe("operation timeout helpers", () => {
  it("rejects with OperationTimeoutError when an operation exceeds its budget", async () => {
    await expect(
      withTimeout(new Promise(() => {}), 5, "slow operation")
    ).rejects.toBeInstanceOf(OperationTimeoutError);
  });

  it("rejects an abortable timeout when its signal is aborted", async () => {
    const abortController = new AbortController();
    const timeoutPromise = waitForAbortableTimeout(
      1000,
      abortController.signal,
      "render delay"
    );

    abortController.abort();

    await expect(timeoutPromise).rejects.toBeInstanceOf(OperationAbortedError);
  });
});
