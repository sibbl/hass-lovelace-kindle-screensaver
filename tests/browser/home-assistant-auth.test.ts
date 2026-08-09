import type { Browser, BrowserContext } from "playwright-core";
import { describe, expect, it, vi } from "vitest";
import { HomeAssistantAuth } from "../../src/browser/home-assistant-auth";
import { createPageConfig } from "../fixtures";

interface BrowserMocks {
  browser: Browser;
  browserContext: BrowserContext;
  createContext: ReturnType<typeof vi.fn>;
  addInitScript: ReturnType<typeof vi.fn>;
  closeContext: ReturnType<typeof vi.fn>;
}

function createBrowserMocks(): BrowserMocks {
  const addInitScript = vi.fn(async () => undefined);
  const closeContext = vi.fn(async () => undefined);
  const browserContext = {
    addInitScript,
    close: closeContext,
  } as unknown as BrowserContext;
  const createContext = vi.fn(async () => browserContext);
  const browser = {
    newContext: createContext,
  } as unknown as Browser;

  return {
    browser,
    browserContext,
    createContext,
    addInitScript,
    closeContext,
  };
}

describe("Home Assistant browser authentication", () => {
  it("adds instance-specific authentication to an isolated context", async () => {
    const mocks = createBrowserMocks();
    const auth = new HomeAssistantAuth({ log: vi.fn(), error: vi.fn() });
    const pageConfig = createPageConfig({
      accessToken: "secret-token",
      language: "de",
      theme: { theme: "eink" },
    });

    await expect(auth.getAuthenticatedContext(mocks.browser, pageConfig)).resolves.toBe(
      mocks.browserContext,
    );
    expect(mocks.createContext).toHaveBeenCalledWith({ locale: "de", viewport: null });
    expect(mocks.addInitScript).toHaveBeenCalledWith(expect.any(Function), {
      tokens: JSON.stringify({
        hassUrl: "https://home.example.test",
        access_token: "secret-token",
        token_type: "Bearer",
      }),
      selectedLanguage: JSON.stringify("de"),
      selectedTheme: JSON.stringify({ theme: "eink" }),
    });
  });

  it("reuses one context for matching instance settings", async () => {
    const mocks = createBrowserMocks();
    const auth = new HomeAssistantAuth({ log: vi.fn(), error: vi.fn() });

    const first = await auth.getAuthenticatedContext(mocks.browser, createPageConfig());
    const second = await auth.getAuthenticatedContext(mocks.browser, createPageConfig());

    expect(first).toBe(second);
    expect(mocks.createContext).toHaveBeenCalledOnce();
  });

  it("shares an in-flight authentication attempt", async () => {
    let finishInitialization: (() => void) | undefined;
    const initialization = new Promise<void>((resolve) => {
      finishInitialization = resolve;
    });
    const mocks = createBrowserMocks();
    mocks.addInitScript.mockReturnValueOnce(initialization);
    const auth = new HomeAssistantAuth({ log: vi.fn(), error: vi.fn() });

    const first = auth.getAuthenticatedContext(mocks.browser, createPageConfig());
    const second = auth.getAuthenticatedContext(mocks.browser, createPageConfig());
    await vi.waitFor(() => expect(mocks.addInitScript).toHaveBeenCalledOnce());

    finishInitialization?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      mocks.browserContext,
      mocks.browserContext,
    ]);
    expect(mocks.createContext).toHaveBeenCalledOnce();
  });

  it("isolates distinct credentials on the same URL", async () => {
    const first = createBrowserMocks();
    const second = createBrowserMocks();
    const createContext = vi
      .fn()
      .mockResolvedValueOnce(first.browserContext)
      .mockResolvedValueOnce(second.browserContext);
    const browser = {
      newContext: createContext,
    } as unknown as Browser;
    const auth = new HomeAssistantAuth({ log: vi.fn(), error: vi.fn() });

    const firstContext = await auth.getAuthenticatedContext(
      browser,
      createPageConfig({ accessToken: "first" }),
    );
    const secondContext = await auth.getAuthenticatedContext(
      browser,
      createPageConfig({ accessToken: "second" }),
    );

    expect(firstContext).toBe(first.browserContext);
    expect(secondContext).toBe(second.browserContext);
    expect(createContext).toHaveBeenCalledTimes(2);
  });

  it("discards failed contexts so the next render can retry", async () => {
    const failed = createBrowserMocks();
    failed.addInitScript.mockRejectedValueOnce(new Error("context initialization failed"));
    const recovered = createBrowserMocks();
    const createContext = vi
      .fn()
      .mockResolvedValueOnce(failed.browserContext)
      .mockResolvedValueOnce(recovered.browserContext);
    const browser = {
      newContext: createContext,
    } as unknown as Browser;
    const auth = new HomeAssistantAuth({ log: vi.fn(), error: vi.fn() });
    const config = createPageConfig();

    await expect(auth.getAuthenticatedContext(browser, config)).rejects.toThrow(
      "context initialization failed",
    );
    await expect(auth.getAuthenticatedContext(browser, config)).resolves.toBe(
      recovered.browserContext,
    );
    expect(failed.closeContext).toHaveBeenCalledOnce();
  });
});
