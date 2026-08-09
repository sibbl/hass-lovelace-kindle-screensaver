import type { Browser, BrowserContext, Page } from "puppeteer";
import { describe, expect, it, vi } from "vitest";
import { HomeAssistantAuth } from "../../src/browser/home-assistant-auth";
import { createPageConfig } from "../fixtures";

interface BrowserMocks {
  browser: Browser;
  browserContext: BrowserContext;
  page: Page;
  createContext: ReturnType<typeof vi.fn>;
  goto: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  closePage: ReturnType<typeof vi.fn>;
  closeContext: ReturnType<typeof vi.fn>;
}

function createBrowserMocks(): BrowserMocks {
  const goto = vi.fn(async () => null);
  const evaluate = vi.fn(async () => undefined);
  const closePage = vi.fn(async () => undefined);
  const page = {
    goto,
    evaluate,
    close: closePage
  } as unknown as Page;
  const closeContext = vi.fn(async () => undefined);
  const browserContext = {
    newPage: vi.fn(async () => page),
    close: closeContext
  } as unknown as BrowserContext;
  const createContext = vi.fn(async () => browserContext);
  const browser = {
    createIncognitoBrowserContext: createContext
  } as unknown as Browser;

  return {
    browser,
    browserContext,
    page,
    createContext,
    goto,
    evaluate,
    closePage,
    closeContext
  };
}

describe("Home Assistant browser authentication", () => {
  it("adds instance-specific authentication to an isolated context", async () => {
    const mocks = createBrowserMocks();
    const auth = new HomeAssistantAuth({ log: vi.fn(), error: vi.fn() });
    const pageConfig = createPageConfig({
      accessToken: "secret-token",
      language: "de",
      theme: { theme: "eink" }
    });

    await expect(
      auth.getAuthenticatedContext(mocks.browser, pageConfig, 1234)
    ).resolves.toBe(mocks.browserContext);
    expect(mocks.goto).toHaveBeenCalledWith("https://home.example.test", {
      timeout: 1234
    });
    expect(mocks.evaluate.mock.calls[0]?.slice(1)).toEqual([
      JSON.stringify({
        hassUrl: "https://home.example.test",
        access_token: "secret-token",
        token_type: "Bearer"
      }),
      JSON.stringify("de"),
      JSON.stringify({ theme: "eink" })
    ]);
    expect(mocks.closePage).toHaveBeenCalledOnce();
  });

  it("reuses one context for matching instance settings", async () => {
    const mocks = createBrowserMocks();
    const auth = new HomeAssistantAuth({ log: vi.fn(), error: vi.fn() });

    const first = await auth.getAuthenticatedContext(
      mocks.browser,
      createPageConfig(),
      1000
    );
    const second = await auth.getAuthenticatedContext(
      mocks.browser,
      createPageConfig(),
      1000
    );

    expect(first).toBe(second);
    expect(mocks.createContext).toHaveBeenCalledOnce();
  });

  it("shares an in-flight authentication attempt", async () => {
    let finishNavigation: (() => void) | undefined;
    const navigation = new Promise<null>((resolve) => {
      finishNavigation = () => resolve(null);
    });
    const mocks = createBrowserMocks();
    mocks.goto.mockReturnValueOnce(navigation);
    const auth = new HomeAssistantAuth({ log: vi.fn(), error: vi.fn() });

    const first = auth.getAuthenticatedContext(
      mocks.browser,
      createPageConfig(),
      1000
    );
    const second = auth.getAuthenticatedContext(
      mocks.browser,
      createPageConfig(),
      1000
    );
    await vi.waitFor(() => expect(mocks.goto).toHaveBeenCalledOnce());

    finishNavigation?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      mocks.browserContext,
      mocks.browserContext
    ]);
    expect(mocks.createContext).toHaveBeenCalledOnce();
    expect(mocks.evaluate).toHaveBeenCalledOnce();
  });

  it("isolates distinct credentials on the same URL", async () => {
    const first = createBrowserMocks();
    const second = createBrowserMocks();
    const createContext = vi
      .fn()
      .mockResolvedValueOnce(first.browserContext)
      .mockResolvedValueOnce(second.browserContext);
    const browser = {
      createIncognitoBrowserContext: createContext
    } as unknown as Browser;
    const auth = new HomeAssistantAuth({ log: vi.fn(), error: vi.fn() });

    const firstContext = await auth.getAuthenticatedContext(
      browser,
      createPageConfig({ accessToken: "first" }),
      1000
    );
    const secondContext = await auth.getAuthenticatedContext(
      browser,
      createPageConfig({ accessToken: "second" }),
      1000
    );

    expect(firstContext).toBe(first.browserContext);
    expect(secondContext).toBe(second.browserContext);
    expect(createContext).toHaveBeenCalledTimes(2);
  });

  it("discards failed contexts so the next render can retry", async () => {
    const failed = createBrowserMocks();
    failed.goto.mockRejectedValueOnce(new Error("instance unavailable"));
    const recovered = createBrowserMocks();
    const createContext = vi
      .fn()
      .mockResolvedValueOnce(failed.browserContext)
      .mockResolvedValueOnce(recovered.browserContext);
    const browser = {
      createIncognitoBrowserContext: createContext
    } as unknown as Browser;
    const auth = new HomeAssistantAuth({ log: vi.fn(), error: vi.fn() });
    const config = createPageConfig();

    await expect(
      auth.getAuthenticatedContext(browser, config, 1000)
    ).rejects.toThrow("instance unavailable");
    await expect(
      auth.getAuthenticatedContext(browser, config, 1000)
    ).resolves.toBe(recovered.browserContext);
    expect(failed.closePage).toHaveBeenCalledOnce();
    expect(failed.closeContext).toHaveBeenCalledOnce();
  });
});
