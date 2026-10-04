import type { Browser } from "playwright-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserManager } from "../../src/browser/browser-manager";
import { createAppConfig } from "../fixtures";

interface MockBrowser {
  browser: Browser;
  close: ReturnType<typeof vi.fn>;
  disconnect(): void;
}

function createMockBrowser(): MockBrowser {
  let disconnected: (() => void) | undefined;
  const close = vi.fn(async () => undefined);
  const browser = {
    close,
    on: vi.fn((event: string, listener: () => void) => {
      if (event === "disconnected") {
        disconnected = listener;
      }
      return browser;
    }),
  } as unknown as Browser;

  return {
    browser,
    close,
    disconnect: () => disconnected?.(),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("browser manager", () => {
  it("launches Chromium with the configured shared options", async () => {
    const mockBrowser = createMockBrowser();
    const launch = vi.fn(async () => mockBrowser.browser);
    const manager = new BrowserManager(
      createAppConfig({
        language: "de",
        ignoreCertificateErrors: true,
        debug: true,
        browserLaunchTimeout: 1234,
      }),
      { log: vi.fn(), error: vi.fn() },
      launch,
    );

    await expect(manager.initialize()).resolves.toBe(mockBrowser.browser);
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(["--no-sandbox", "--lang=de", "--ignore-certificate-errors"]),
        timeout: 1234,
        headless: false,
      }),
    );
  });

  it("reuses Chromium until an explicit cache reset", async () => {
    const first = createMockBrowser();
    const second = createMockBrowser();
    const launch = vi
      .fn()
      .mockResolvedValueOnce(first.browser)
      .mockResolvedValueOnce(second.browser);
    const manager = new BrowserManager(createAppConfig(), { log: vi.fn(), error: vi.fn() }, launch);

    await expect(manager.ensureBrowser()).resolves.toBe(first.browser);
    await expect(manager.ensureBrowser()).resolves.toBe(first.browser);
    await expect(manager.ensureBrowser({ resetBrowserCache: true })).resolves.toBe(second.browser);

    expect(launch).toHaveBeenCalledTimes(2);
    expect(first.close).toHaveBeenCalledOnce();
  });

  it("restarts Chromium after the configured cache TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const first = createMockBrowser();
    const second = createMockBrowser();
    const launch = vi
      .fn()
      .mockResolvedValueOnce(first.browser)
      .mockResolvedValueOnce(second.browser);
    const manager = new BrowserManager(
      createAppConfig({ browserCacheTtl: 1000 }),
      { log: vi.fn(), error: vi.fn() },
      launch,
    );

    await manager.ensureBrowser();
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    await expect(manager.ensureBrowser()).resolves.toBe(second.browser);

    expect(first.close).toHaveBeenCalledOnce();
  });

  it("forgets a browser when Chromium disconnects", async () => {
    const first = createMockBrowser();
    const second = createMockBrowser();
    const launch = vi
      .fn()
      .mockResolvedValueOnce(first.browser)
      .mockResolvedValueOnce(second.browser);
    const manager = new BrowserManager(createAppConfig(), { log: vi.fn(), error: vi.fn() }, launch);

    await manager.ensureBrowser();
    first.disconnect();
    await expect(manager.ensureBrowser()).resolves.toBe(second.browser);
  });
});
