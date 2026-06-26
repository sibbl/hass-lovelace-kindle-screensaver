import puppeteer, { type Browser, type Page } from "puppeteer";
import type { AppConfig, BrowserProvider, BrowserRequestOptions } from "./types";
import { closeBrowser } from "./rendering";

export class BrowserManager implements BrowserProvider {
  private browser: Browser | null = null;
  private browserStartedAt: number | null = null;
  private initInProgress = false;

  constructor(private readonly config: AppConfig) {}

  getStartedAt(): number | null {
    return this.browserStartedAt;
  }

  async ensureBrowser(options: BrowserRequestOptions): Promise<Browser> {
    if (options.resetBrowserCache) {
      await this.closeBrowser("browser cache reset request");
    } else if (this.isBrowserCacheExpired()) {
      await this.closeBrowser("browser cache TTL expiry");
    }

    if (!this.browser) {
      await this.initBrowser();
      if (!this.browser) {
        throw new Error("Browser not ready after init attempt");
      }
    }

    return this.browser;
  }

  async closeBrowser(reason: string): Promise<void> {
    if (!this.browser) {
      return;
    }

    const browserToClose = this.browser;
    this.browser = null;
    this.browserStartedAt = null;
    console.error(`Closing browser after ${reason}`);
    await closeBrowser(browserToClose, reason);
  }

  async initBrowser(): Promise<Browser | null> {
    if (this.browser) {
      return this.browser;
    }

    if (this.initInProgress) {
      console.log("Browser init already in progress, skipping init attempt");
      return null;
    }

    this.initInProgress = true;
    let nextBrowser: Browser | null = null;
    let page: Page | null = null;

    try {
      console.log("Starting browser...");
      nextBrowser = await puppeteer.launch({
        args: [
          "--disable-dev-shm-usage",
          "--no-sandbox",
          `--lang=${this.config.language}`,
          this.config.ignoreCertificateErrors
            ? "--ignore-certificate-errors"
            : null
        ].filter((argument): argument is string => argument !== null),
        defaultViewport: null,
        timeout: this.config.browserLaunchTimeout,
        headless: this.config.debug !== true
      });

      console.log(`Visiting '${this.config.baseUrl}' to login...`);
      page = await nextBrowser.newPage();
      await page.goto(requiredConfigValue(this.config.baseUrl, "HA_BASE_URL"), {
        timeout: this.config.renderingTimeout
      });

      const hassTokens = {
        hassUrl: this.config.baseUrl,
        access_token: this.config.accessToken,
        token_type: "Bearer"
      };

      console.log("Adding authentication entry to browser's local storage...");
      await page.evaluate(
        (tokens, selectedLanguage, selectedTheme) => {
          localStorage.setItem("hassTokens", tokens);
          localStorage.setItem("selectedLanguage", selectedLanguage);
          if (selectedTheme) {
            localStorage.setItem("selectedTheme", selectedTheme);
          }
        },
        JSON.stringify(hassTokens),
        JSON.stringify(this.config.language),
        this.config.theme ? JSON.stringify(this.config.theme) : null
      );

      await page.close();
      page = null;

      this.browser = nextBrowser;
      this.browserStartedAt = Date.now();
      nextBrowser.on("disconnected", () => {
        if (this.browser === nextBrowser) {
          this.browser = null;
          this.browserStartedAt = null;
        }
      });

      return this.browser;
    } catch (error) {
      console.error(
        "Browser/HA login failed, will retry on next render tick:",
        error
      );
      if (page) {
        await page.close().catch((closeError) => {
          console.error(
            "Failed to close login page after browser init failure:",
            closeError
          );
        });
      }
      if (nextBrowser) {
        await nextBrowser.close().catch((closeError) => {
          console.error("Failed to close browser after init failure:", closeError);
        });
      }
      return null;
    } finally {
      this.initInProgress = false;
    }
  }

  private isBrowserCacheExpired(): boolean {
    return (
      this.config.browserCacheTtl > 0 &&
      this.browserStartedAt !== null &&
      Date.now() - this.browserStartedAt >= this.config.browserCacheTtl
    );
  }
}

function requiredConfigValue(
  value: string | undefined,
  environmentVariableName: string
): string {
  if (!value) {
    throw new Error(`${environmentVariableName} is required`);
  }

  return value;
}
