import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { RenderCoordinator } = require("./render-coordinator.js");

function createDeferred() {
  let resolve;
  const promise = new Promise((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

describe("render coordinator", () => {
  it("skips scheduled renders while work is already pending", async () => {
    const deferred = createDeferred();
    const work = vi.fn(() => deferred.promise);
    const coordinator = new RenderCoordinator({
      renderJobTimeout: 1000,
      ensureBrowser: vi.fn(async () => "browser"),
      closeBrowser: vi.fn(),
      logger: { log: vi.fn(), error: vi.fn() }
    });

    const activeRender = coordinator.run("manual render", work);
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(1));

    const skippedRender = await coordinator.run(
      "scheduled render",
      vi.fn(),
      { skipIfBusy: true }
    );

    expect(skippedRender).toEqual({
      status: "skipped",
      reason: "render_in_progress"
    });

    deferred.resolve();
    await expect(activeRender).resolves.toEqual({ status: "ok" });
  });

  it("queues requested renders behind active renders", async () => {
    const firstDeferred = createDeferred();
    const calls = [];
    const coordinator = new RenderCoordinator({
      renderJobTimeout: 1000,
      ensureBrowser: vi.fn(async () => "browser"),
      closeBrowser: vi.fn(),
      logger: { log: vi.fn(), error: vi.fn() }
    });

    const firstRender = coordinator.run("first render", async () => {
      calls.push("first");
      await firstDeferred.promise;
    });
    await vi.waitFor(() => expect(calls).toEqual(["first"]));

    const secondRender = coordinator.run("second render", async () => {
      calls.push("second");
    });

    await Promise.resolve();
    expect(calls).toEqual(["first"]);

    firstDeferred.resolve();
    await expect(firstRender).resolves.toEqual({ status: "ok" });
    await expect(secondRender).resolves.toEqual({ status: "ok" });
    expect(calls).toEqual(["first", "second"]);
  });

  it("passes cache reset requests to browser initialization", async () => {
    const ensureBrowser = vi.fn(async () => "browser");
    const coordinator = new RenderCoordinator({
      renderJobTimeout: 1000,
      ensureBrowser,
      closeBrowser: vi.fn(),
      logger: { log: vi.fn(), error: vi.fn() }
    });

    await coordinator.run("cache clear render", async () => {}, {
      resetBrowserCache: true
    });

    expect(ensureBrowser).toHaveBeenCalledWith({ resetBrowserCache: true });
  });

  it("can skip the global success callback for page-specific renders", async () => {
    const onSuccess = vi.fn();
    const coordinator = new RenderCoordinator({
      renderJobTimeout: 1000,
      ensureBrowser: vi.fn(async () => "browser"),
      closeBrowser: vi.fn(),
      onSuccess,
      logger: { log: vi.fn(), error: vi.fn() }
    });

    await coordinator.run("single page render", async () => {}, {
      updateLastSuccessfulRender: false
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("returns failed status and closes the browser after render timeout", async () => {
    const closeBrowser = vi.fn();
    const coordinator = new RenderCoordinator({
      renderJobTimeout: 5,
      ensureBrowser: vi.fn(async () => "browser"),
      closeBrowser,
      logger: { log: vi.fn(), error: vi.fn() }
    });

    const result = await coordinator.run(
      "stuck render",
      () => new Promise(() => {})
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain("stuck render timed out");
    expect(closeBrowser).toHaveBeenCalledWith("stuck render timeout");
  });
});
