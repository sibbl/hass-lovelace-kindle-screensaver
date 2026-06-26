import {
  OperationAbortedError,
  OperationTimeoutError,
  withTimeout
} from "./operation-timeout";
import type {
  BrowserRequestOptions,
  Logger,
  RenderContext,
  RenderResult,
  RenderRunOptions,
  RenderState
} from "./types";

export interface RenderCoordinatorOptions<TBrowser> {
  readonly renderJobTimeout: number;
  readonly ensureBrowser: (options: BrowserRequestOptions) => Promise<TBrowser>;
  readonly closeBrowser: (reason: string) => Promise<void>;
  readonly onSuccess?: () => void;
  readonly logger?: Logger;
  readonly cleanupTimeout?: number;
}

type RenderWork<TBrowser> = (
  browser: TBrowser,
  renderContext: RenderContext
) => Promise<void>;

export class RenderCoordinator<TBrowser> {
  private readonly renderJobTimeout: number;
  private readonly ensureBrowser: (options: BrowserRequestOptions) => Promise<TBrowser>;
  private readonly closeBrowser: (reason: string) => Promise<void>;
  private readonly onSuccess: (() => void) | undefined;
  private readonly logger: Logger;
  private readonly cleanupTimeout: number;
  private queue: Promise<RenderResult> = Promise.resolve({ status: "ok" });
  private pendingCount = 0;
  private renderInProgress = false;
  private renderStartedAt: number | null = null;

  constructor(options: RenderCoordinatorOptions<TBrowser>) {
    this.renderJobTimeout = options.renderJobTimeout;
    this.ensureBrowser = options.ensureBrowser;
    this.closeBrowser = options.closeBrowser;
    this.onSuccess = options.onSuccess;
    this.logger = options.logger ?? console;
    this.cleanupTimeout = options.cleanupTimeout ?? 5000;
  }

  hasWork(): boolean {
    return this.pendingCount > 0;
  }

  getState(now = Date.now()): RenderState {
    return {
      renderInProgress: this.renderInProgress,
      renderInProgressFor:
        this.renderStartedAt === null ? null : now - this.renderStartedAt
    };
  }

  run(
    label: string,
    work: RenderWork<TBrowser>,
    options: RenderRunOptions = {}
  ): Promise<RenderResult> {
    if (options.skipIfBusy === true && this.hasWork()) {
      this.logger.log(`Render already queued or in progress, skipping ${label}`);
      return Promise.resolve({
        status: "skipped",
        reason: "render_in_progress"
      });
    }

    this.pendingCount++;
    const queuedWork = this.queue
      .catch(() => ({ status: "failed", error: "previous render failed" } as const))
      .then(() => this.execute(label, work, options))
      .finally(() => {
        this.pendingCount--;
      });

    this.queue = queuedWork.catch((error) => ({
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    }));
    return queuedWork;
  }

  private async execute(
    label: string,
    work: RenderWork<TBrowser>,
    options: RenderRunOptions
  ): Promise<RenderResult> {
    this.renderInProgress = true;
    this.renderStartedAt = Date.now();
    let timedOut = false;
    const abortController = new AbortController();
    let workPromise: Promise<void> | null = null;

    try {
      const browser = await this.ensureBrowser({
        resetBrowserCache: options.resetBrowserCache === true
      });
      workPromise = Promise.resolve().then(() => {
        return work(browser, { signal: abortController.signal });
      });
      await withTimeout(workPromise, this.renderJobTimeout, label, () => {
        timedOut = true;
        abortController.abort();
      });

      if (options.updateLastSuccessfulRender !== false) {
        this.onSuccess?.();
      }

      return { status: "ok" };
    } catch (error) {
      this.logger.error(
        `${label} failed but server stays alive:`,
        error instanceof Error ? error : new Error(String(error))
      );
      if (timedOut || error instanceof OperationTimeoutError) {
        await this.closeBrowser(`${label} timeout`);
        await this.waitForTimedOutWork(label, workPromise);
      }

      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      this.renderInProgress = false;
      this.renderStartedAt = null;
    }
  }

  private async waitForTimedOutWork(
    label: string,
    workPromise: Promise<void> | null
  ): Promise<void> {
    if (workPromise === null) {
      return;
    }

    let cleanupTimedOut = false;
    try {
      await withTimeout(
        workPromise.catch((error) => {
          if (!(error instanceof OperationAbortedError)) {
            this.logger.error(
              `${label} cleanup finished after error:`,
              error instanceof Error ? error : new Error(String(error))
            );
          }
        }),
        this.cleanupTimeout,
        `${label} cleanup`,
        () => {
          cleanupTimedOut = true;
        }
      );
    } catch (error) {
      if (cleanupTimedOut || error instanceof OperationTimeoutError) {
        this.logger.error(
          `${label} cleanup did not finish after ${this.cleanupTimeout}ms`
        );
        return;
      }

      this.logger.error(
        `${label} cleanup failed:`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}
