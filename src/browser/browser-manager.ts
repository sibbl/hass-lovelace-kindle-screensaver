import { chromium, type Browser, type LaunchOptions } from "playwright-core";
import { withTimeout } from "../shared/operation-timeout";
import type { AppConfig, EnsureBrowserOptions, Logger } from "../types";

export type BrowserLauncher = (options: LaunchOptions) => Promise<Browser>;

export class BrowserManager {
  private readonly config: AppConfig;
  private readonly logger: Logger;
  private readonly launchBrowser: BrowserLauncher;
  private browser: Browser | null = null;
  private browserStartedAt: number | null = null;
  private initInProgress = false;

  public constructor(
    config: AppConfig,
    logger: Logger = console,
    launchBrowser: BrowserLauncher = (options) => chromium.launch(options),
  ) {
    this.config = config;
    this.logger = logger;
    this.launchBrowser = launchBrowser;
  }

  public async initialize(): Promise<Browser | null> {
    if (this.browser) {
      return this.browser;
    }
    if (this.initInProgress) {
      this.logger.log("Browser init already in progress, skipping init attempt");
      return null;
    }

    this.initInProgress = true;
    let nextBrowser: Browser | null = null;
    try {
      this.logger.log("Starting browser...");
      const executablePath =
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? process.env.PUPPETEER_EXECUTABLE_PATH;
      nextBrowser = await this.launchBrowser({
        args: [
          "--disable-dev-shm-usage",
          "--no-sandbox",
          `--lang=${this.config.language}`,
          ...(this.config.ignoreCertificateErrors ? ["--ignore-certificate-errors"] : []),
        ],
        ...(executablePath ? { executablePath } : {}),
        timeout: this.config.browserLaunchTimeout,
        headless: !this.config.debug,
      });

      this.browser = nextBrowser;
      this.browserStartedAt = Date.now();
      nextBrowser.on("disconnected", () => {
        if (this.browser === nextBrowser) {
          this.browser = null;
          this.browserStartedAt = null;
        }
      });
      return nextBrowser;
    } catch (error: unknown) {
      this.logger.error("Browser startup failed, will retry on next render tick:", error);
      if (nextBrowser) {
        await nextBrowser.close().catch((closeError: unknown) => {
          this.logger.error("Failed to close browser after init failure:", closeError);
        });
      }
      return null;
    } finally {
      this.initInProgress = false;
    }
  }

  public async ensureBrowser({
    resetBrowserCache = false,
  }: EnsureBrowserOptions = {}): Promise<Browser> {
    if (resetBrowserCache) {
      await this.closeCurrentBrowser("browser cache reset request");
    } else if (this.isBrowserCacheExpired()) {
      await this.closeCurrentBrowser("browser cache TTL expiry");
    }

    if (!this.browser) {
      await this.initialize();
      if (!this.browser) {
        throw new Error("Browser not ready after init attempt");
      }
    }

    return this.browser;
  }

  public async closeCurrentBrowser(reason: string): Promise<void> {
    if (!this.browser) {
      return;
    }

    const browserToClose = this.browser;
    this.browser = null;
    this.browserStartedAt = null;
    this.logger.error(`Closing browser after ${reason}`);
    await closeBrowser(browserToClose, reason, this.logger);
  }

  private isBrowserCacheExpired(): boolean {
    return (
      this.config.browserCacheTtl > 0 &&
      this.browserStartedAt !== null &&
      Date.now() - this.browserStartedAt >= this.config.browserCacheTtl
    );
  }
}

export async function closeBrowser(
  browser: Browser,
  reason: string,
  logger: Logger = console,
): Promise<void> {
  try {
    await withTimeout(browser.close({ reason }), 5000, `close browser after ${reason}`);
  } catch (error: unknown) {
    logger.error(`Failed to close browser after ${reason}:`, error);
  }
}
