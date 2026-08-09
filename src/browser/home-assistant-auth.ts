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
    const browserContext = await browser.newContext({
      locale: pageConfig.language,
      viewport: null,
    });

    try {
      const hassTokens = {
        hassUrl: pageConfig.baseUrl,
        access_token: pageConfig.accessToken,
        token_type: "Bearer",
      };

      this.logger.log("Adding authentication entry to browser's local storage...");
      await browserContext.addInitScript(
        ({ tokens, selectedLanguage, selectedTheme }) => {
          localStorage.setItem("hassTokens", tokens);
          localStorage.setItem("selectedLanguage", selectedLanguage);
          if (selectedTheme) {
            localStorage.setItem("selectedTheme", selectedTheme);
          }
        },
        {
          tokens: JSON.stringify(hassTokens),
          selectedLanguage: JSON.stringify(pageConfig.language),
          selectedTheme: pageConfig.theme ? JSON.stringify(pageConfig.theme) : null,
        },
      );

      return browserContext;
    } catch (error: unknown) {
      await browserContext.close().catch(() => undefined);
      throw error;
    }
  }
}
