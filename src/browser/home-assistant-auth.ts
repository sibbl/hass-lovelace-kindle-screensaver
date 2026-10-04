import type { Browser, BrowserContext } from "playwright-core";
import type { Logger, PageConfig } from "../types";

function getInstanceKey(pageConfig: PageConfig): string {
  return JSON.stringify([
    pageConfig.baseUrl,
    pageConfig.accessToken,
    pageConfig.language,
    pageConfig.theme,
  ]);
}

export class HomeAssistantAuth {
  private readonly contextsByBrowser = new WeakMap<Browser, Map<string, Promise<BrowserContext>>>();
  private readonly logger: Logger;

  public constructor(logger: Logger = console) {
    this.logger = logger;
  }

  public async getAuthenticatedContext(
    browser: Browser,
    pageConfig: PageConfig,
  ): Promise<BrowserContext> {
    let browserContexts = this.contextsByBrowser.get(browser);
    if (!browserContexts) {
      browserContexts = new Map<string, Promise<BrowserContext>>();
      this.contextsByBrowser.set(browser, browserContexts);
    }

    const instanceKey = getInstanceKey(pageConfig);
    let contextPromise = browserContexts.get(instanceKey);

    if (!contextPromise) {
      contextPromise = this.createAuthenticatedContext(browser, pageConfig);
      browserContexts.set(instanceKey, contextPromise);
    }

    try {
      return await contextPromise;
    } catch (error: unknown) {
      if (browserContexts.get(instanceKey) === contextPromise) {
        browserContexts.delete(instanceKey);
      }
      throw error;
    }
  }

  private async createAuthenticatedContext(
    browser: Browser,
    pageConfig: PageConfig,
  ): Promise<BrowserContext> {
    const baseUrl = new URL(pageConfig.baseUrl);
    if (!["http:", "https:"].includes(baseUrl.protocol)) {
      throw new Error("Home Assistant base URL must use HTTP or HTTPS");
    }
    const localStorage = [
      {
        name: "hassTokens",
        value: JSON.stringify({
          hassUrl: pageConfig.baseUrl,
          access_token: pageConfig.accessToken,
          token_type: "Bearer",
        }),
      },
      { name: "selectedLanguage", value: JSON.stringify(pageConfig.language) },
    ];
    if (pageConfig.theme) {
      localStorage.push({ name: "selectedTheme", value: JSON.stringify(pageConfig.theme) });
    }

    this.logger.log("Adding origin-scoped Home Assistant authentication...");
    // Init scripts run in every page and child frame, including foreign origins.
    // Seed only HA's origin instead, so redirects and embeds never get the token.
    return browser.newContext({
      locale: pageConfig.language,
      viewport: null,
      storageState: { cookies: [], origins: [{ origin: baseUrl.origin, localStorage }] },
    });
  }
}
