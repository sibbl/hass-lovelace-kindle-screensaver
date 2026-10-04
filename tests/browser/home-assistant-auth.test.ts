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
    expect(mocks.createContext).toHaveBeenCalledWith({
      locale: "de",
      viewport: null,
      storageState: {
        cookies: [],
        origins: [
          {
            origin: "https://home.example.test",
            localStorage: [
              {
                name: "hassTokens",
                value: JSON.stringify({
                  hassUrl: "https://home.example.test",
                  access_token: "secret-token",
                  token_type: "Bearer",
                }),
              },
              { name: "selectedLanguage", value: JSON.stringify("de") },
              { name: "selectedTheme", value: JSON.stringify({ theme: "eink" }) },
            ],
          },
        ],
      },
    });
    expect(mocks.addInitScript).not.toHaveBeenCalled();
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
    mocks.createContext.mockImplementationOnce(async () => {
      await initialization;
      return mocks.browserContext;
    });
    const auth = new HomeAssistantAuth({ log: vi.fn(), error: vi.fn() });

    const first = auth.getAuthenticatedContext(mocks.browser, createPageConfig());
    const second = auth.getAuthenticatedContext(mocks.browser, createPageConfig());
    await vi.waitFor(() => expect(mocks.createContext).toHaveBeenCalledOnce());

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
    const recovered = createBrowserMocks();
    const createContext = vi
      .fn()
      .mockRejectedValueOnce(new Error("context initialization failed"))
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
    expect(createContext).toHaveBeenCalledTimes(2);
  });
});

it.each(["file:///tmp/ha", "data:text/html,ha"])(
  "rejects non-HTTP origin %s before creating a context",
  async (baseUrl) => {
    const mocks = createBrowserMocks();
    const auth = new HomeAssistantAuth({ log: vi.fn(), error: vi.fn() });
    await expect(
      auth.getAuthenticatedContext(mocks.browser, createPageConfig({ baseUrl })),
    ).rejects.toThrow("HTTP or HTTPS");
    expect(mocks.createContext).not.toHaveBeenCalled();
  },
);

it("scopes storage to the exact origin including scheme and port, without navigation scripts", async () => {
  const mocks = createBrowserMocks();
  const auth = new HomeAssistantAuth({ log: vi.fn(), error: vi.fn() });
  await auth.getAuthenticatedContext(
    mocks.browser,
    createPageConfig({ baseUrl: "https://home.example.test:8123/ha" }),
  );
  expect(mocks.createContext).toHaveBeenCalledWith(
    expect.objectContaining({
      storageState: {
        cookies: [],
        origins: [{ origin: "https://home.example.test:8123", localStorage: expect.any(Array) }],
      },
    }),
  );
  expect(mocks.addInitScript).not.toHaveBeenCalled();
});
