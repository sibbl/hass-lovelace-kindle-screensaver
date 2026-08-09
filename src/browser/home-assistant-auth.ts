import type { Browser, BrowserContext } from "puppeteer";
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
    renderingTimeout: number,
  ): Promise<BrowserContext> {
    let browserContexts = this.contextsByBrowser.get(browser);
    if (!browserContexts) {
      browserContexts = new Map<string, Promise<BrowserContext>>();
      this.contextsByBrowser.set(browser, browserContexts);
    }

    const instanceKey = getInstanceKey(pageConfig);
    let contextPromise = browserContexts.get(instanceKey);

    if (!contextPromise) {
      contextPromise = this.createAuthenticatedContext(browser, pageConfig, renderingTimeout);
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
    renderingTimeout: number,
  ): Promise<BrowserContext> {
    const browserContext = await browser.createIncognitoBrowserContext();
    let page = null;
    let authenticationFailed = false;

    try {
      page = await browserContext.newPage();
      const hassTokens = {
        hassUrl: pageConfig.baseUrl,
        access_token: pageConfig.accessToken,
        token_type: "Bearer",
      };

      this.logger.log("Adding authentication entry to browser's local storage...");
      await page.evaluateOnNewDocument(
        (tokens: string, selectedLanguage: string, selectedTheme: string | null) => {
          localStorage.setItem("hassTokens", tokens);
          localStorage.setItem("selectedLanguage", selectedLanguage);
          if (selectedTheme) {
            localStorage.setItem("selectedTheme", selectedTheme);
          }
        },
        JSON.stringify(hassTokens),
        JSON.stringify(pageConfig.language),
        pageConfig.theme ? JSON.stringify(pageConfig.theme) : null,
      );
      this.logger.log(`Visiting '${pageConfig.baseUrl}' to login...`);
      await page.goto(pageConfig.baseUrl, {
        timeout: renderingTimeout,
      });

      return browserContext;
    } catch (error: unknown) {
      authenticationFailed = true;
      throw error;
    } finally {
      if (page) {
        await page.close().catch((error: unknown) => {
          this.logger.error(
            "Failed to close login page after Home Assistant authentication:",
            error,
          );
        });
      }
      if (authenticationFailed) {
        await browserContext.close().catch(() => undefined);
      }
    }
  }
}
