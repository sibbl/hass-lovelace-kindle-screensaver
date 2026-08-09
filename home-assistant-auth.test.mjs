import { createRequire } from "module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { getAuthenticatedContext } = require("./home-assistant-auth.js");

function createPageConfig(overrides = {}) {
  return {
    baseUrl: "https://home.example.test",
    accessToken: "token",
    language: "en",
    theme: null,
    ...overrides
  };
}

function createBrowserContext() {
  const page = {
    goto: vi.fn(async () => {}),
    evaluate: vi.fn(async () => {}),
    close: vi.fn(async () => {})
  };
  const browserContext = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => {})
  };

  return { browserContext, page };
}

function createLogger() {
  return { log: vi.fn(), error: vi.fn() };
}

describe("Home Assistant browser authentication", () => {
  it("adds instance-specific authentication to an isolated browser context", async () => {
    const { browserContext, page } = createBrowserContext();
    const browser = {
      createIncognitoBrowserContext: vi.fn(async () => browserContext)
    };
    const pageConfig = createPageConfig({
      accessToken: "secret-token",
      language: "de",
      theme: { theme: "eink" }
    });

    await expect(
      getAuthenticatedContext(browser, pageConfig, 1234, createLogger())
    ).resolves.toBe(browserContext);

    expect(page.goto).toHaveBeenCalledWith("https://home.example.test", {
      timeout: 1234
    });
    expect(page.evaluate.mock.calls[0].slice(1)).toEqual([
      JSON.stringify({
        hassUrl: "https://home.example.test",
        access_token: "secret-token",
        token_type: "Bearer"
      }),
      JSON.stringify("de"),
      JSON.stringify({ theme: "eink" })
    ]);
    expect(page.close).toHaveBeenCalledOnce();
  });

  it("reuses one context for pages with the same instance settings", async () => {
    const { browserContext } = createBrowserContext();
    const browser = {
      createIncognitoBrowserContext: vi.fn(async () => browserContext)
    };
    const logger = createLogger();

    const firstContext = await getAuthenticatedContext(
      browser,
      createPageConfig(),
      1000,
      logger
    );
    const secondContext = await getAuthenticatedContext(
      browser,
      createPageConfig(),
      1000,
      logger
    );

    expect(firstContext).toBe(secondContext);
    expect(browser.createIncognitoBrowserContext).toHaveBeenCalledOnce();
  });

  it("shares an in-flight authentication attempt for matching pages", async () => {
    let finishNavigation;
    const navigation = new Promise((resolve) => {
      finishNavigation = resolve;
    });
    const { browserContext, page } = createBrowserContext();
    page.goto.mockReturnValueOnce(navigation);
    const browser = {
      createIncognitoBrowserContext: vi.fn(async () => browserContext)
    };
    const logger = createLogger();

    const firstContext = getAuthenticatedContext(
      browser,
      createPageConfig(),
      1000,
      logger
    );
    const secondContext = getAuthenticatedContext(
      browser,
      createPageConfig(),
      1000,
      logger
    );
    await vi.waitFor(() => expect(page.goto).toHaveBeenCalledOnce());

    finishNavigation();
    await expect(Promise.all([firstContext, secondContext])).resolves.toEqual([
      browserContext,
      browserContext
    ]);
    expect(browser.createIncognitoBrowserContext).toHaveBeenCalledOnce();
    expect(page.evaluate).toHaveBeenCalledOnce();
  });

  it("isolates distinct credentials even when the base URL is the same", async () => {
    const first = createBrowserContext();
    const second = createBrowserContext();
    const browser = {
      createIncognitoBrowserContext: vi
        .fn()
        .mockResolvedValueOnce(first.browserContext)
        .mockResolvedValueOnce(second.browserContext)
    };
    const logger = createLogger();

    const firstContext = await getAuthenticatedContext(
      browser,
      createPageConfig({ accessToken: "first-token" }),
      1000,
      logger
    );
    const secondContext = await getAuthenticatedContext(
      browser,
      createPageConfig({ accessToken: "second-token" }),
      1000,
      logger
    );

    expect(firstContext).toBe(first.browserContext);
    expect(secondContext).toBe(second.browserContext);
    expect(browser.createIncognitoBrowserContext).toHaveBeenCalledTimes(2);
  });

  it("discards failed authentication contexts so the next render can retry", async () => {
    const failed = createBrowserContext();
    failed.page.goto.mockRejectedValueOnce(new Error("instance unavailable"));
    const recovered = createBrowserContext();
    const browser = {
      createIncognitoBrowserContext: vi
        .fn()
        .mockResolvedValueOnce(failed.browserContext)
        .mockResolvedValueOnce(recovered.browserContext)
    };
    const logger = createLogger();
    const pageConfig = createPageConfig();

    await expect(
      getAuthenticatedContext(browser, pageConfig, 1000, logger)
    ).rejects.toThrow("instance unavailable");
    await expect(
      getAuthenticatedContext(browser, pageConfig, 1000, logger)
    ).resolves.toBe(recovered.browserContext);

    expect(failed.page.close).toHaveBeenCalledOnce();
    expect(failed.browserContext.close).toHaveBeenCalledOnce();
    expect(browser.createIncognitoBrowserContext).toHaveBeenCalledTimes(2);
  });
});
