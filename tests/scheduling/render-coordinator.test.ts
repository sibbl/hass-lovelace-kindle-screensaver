import { describe, expect, it, vi } from "vitest";
import { RenderCoordinator } from "../../src/scheduling/render-coordinator";

function createDeferred(): { promise: Promise<void>; resolve(): void } {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: () => resolvePromise?.()
  };
}

function createCoordinator(
  overrides: Partial<{
    renderJobTimeout: number;
    ensureBrowser(options: { resetBrowserCache?: boolean }): Promise<string>;
    closeBrowser(reason: string): Promise<void>;
    onSuccess(): void;
  }> = {}
): RenderCoordinator<string> {
  return new RenderCoordinator<string>({
    renderJobTimeout: 1000,
    ensureBrowser: async () => "browser",
    closeBrowser: async () => undefined,
    logger: { log: vi.fn(), error: vi.fn() },
    ...overrides
  });
}

describe("render coordinator", () => {
  it("skips scheduled renders while work is already pending", async () => {
    const deferred = createDeferred();
    const work = vi.fn(() => deferred.promise);
    const coordinator = createCoordinator();

    const activeRender = coordinator.run("manual render", work);
    await vi.waitFor(() => expect(work).toHaveBeenCalledOnce());

    await expect(
      coordinator.run("scheduled render", async () => undefined, {
        skipIfBusy: true
      })
    ).resolves.toEqual({
      status: "skipped",
      reason: "render_in_progress"
    });

    deferred.resolve();
    await expect(activeRender).resolves.toEqual({ status: "ok" });
  });

  it("queues requested renders behind active renders", async () => {
    const deferred = createDeferred();
    const calls: string[] = [];
    const coordinator = createCoordinator();

    const firstRender = coordinator.run("first", async () => {
      calls.push("first");
      await deferred.promise;
    });
    await vi.waitFor(() => expect(calls).toEqual(["first"]));
    const secondRender = coordinator.run("second", async () => {
      calls.push("second");
    });

    expect(calls).toEqual(["first"]);
    deferred.resolve();
    await firstRender;
    await secondRender;
    expect(calls).toEqual(["first", "second"]);
  });

  it("passes cache reset requests to browser initialization", async () => {
    const ensureBrowser = vi.fn(async () => "browser");
    const coordinator = createCoordinator({ ensureBrowser });

    await coordinator.run("cache clear", async () => undefined, {
      resetBrowserCache: true
    });

    expect(ensureBrowser).toHaveBeenCalledWith({ resetBrowserCache: true });
  });

  it("can skip the global success callback", async () => {
    const onSuccess = vi.fn();
    const coordinator = createCoordinator({ onSuccess });

    await coordinator.run("single page", async () => undefined, {
      updateLastSuccessfulRender: false
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("returns failed status and closes the browser after timeout", async () => {
    const closeBrowser = vi.fn(async () => undefined);
    const coordinator = createCoordinator({
      renderJobTimeout: 5,
      closeBrowser
    });

    const result = await coordinator.run(
      "stuck render",
      () => new Promise<void>(() => undefined)
    );

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error).toContain("stuck render timed out");
    }
    expect(closeBrowser).toHaveBeenCalledWith("stuck render timeout");
  });

  it("continues queued work after an ordinary failure", async () => {
    const calls: string[] = [];
    const coordinator = createCoordinator();
    const failed = coordinator.run("failed", async () => {
      calls.push("failed");
      throw new Error("dashboard unavailable");
    });
    const successful = coordinator.run("successful", async () => {
      calls.push("successful");
    });

    await expect(failed).resolves.toEqual({
      status: "failed",
      error: "dashboard unavailable"
    });
    await expect(successful).resolves.toEqual({ status: "ok" });
    expect(calls).toEqual(["failed", "successful"]);
    expect(coordinator.hasWork()).toBe(false);
  });

  it("reports render state only while work is executing", async () => {
    const deferred = createDeferred();
    const coordinator = createCoordinator();
    const render = coordinator.run("stateful", () => deferred.promise);

    await vi.waitFor(() =>
      expect(coordinator.getState().renderInProgress).toBe(true)
    );
    expect(coordinator.getState().renderInProgressFor).toBeGreaterThanOrEqual(0);
    deferred.resolve();
    await render;
    expect(coordinator.getState()).toEqual({
      renderInProgress: false,
      renderInProgressFor: null
    });
  });
});
