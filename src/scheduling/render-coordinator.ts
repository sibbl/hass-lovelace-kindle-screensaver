import { OperationTimeoutError, withTimeout } from "../shared/operation-timeout";
import type {
  EnsureBrowserOptions,
  Logger,
  RenderResult,
  RenderRunOptions,
  RenderState,
} from "../types";

export interface RenderCoordinatorDependencies<TBrowser> {
  renderJobTimeout: number;
  ensureBrowser(options: EnsureBrowserOptions): Promise<TBrowser>;
  closeBrowser(reason: string): Promise<void>;
  onSuccess?: () => void;
  logger?: Logger;
}

export class RenderCoordinator<TBrowser> {
  private readonly renderJobTimeout: number;
  private readonly ensureBrowser: (options: EnsureBrowserOptions) => Promise<TBrowser>;
  private readonly closeBrowser: (reason: string) => Promise<void>;
  private readonly onSuccess: (() => void) | undefined;
  private readonly logger: Logger;
  private queue: Promise<unknown> = Promise.resolve();
  private pendingCount = 0;
  private renderInProgress = false;
  private renderStartedAt: number | null = null;

  public constructor({
    renderJobTimeout,
    ensureBrowser,
    closeBrowser,
    onSuccess,
    logger = console,
  }: RenderCoordinatorDependencies<TBrowser>) {
    this.renderJobTimeout = renderJobTimeout;
    this.ensureBrowser = ensureBrowser;
    this.closeBrowser = closeBrowser;
    this.onSuccess = onSuccess;
    this.logger = logger;
  }

  public hasWork(): boolean {
    return this.pendingCount > 0;
  }

  public getState(now = Date.now()): RenderState {
    return {
      renderInProgress: this.renderInProgress,
      renderInProgressFor: this.renderStartedAt === null ? null : now - this.renderStartedAt,
    };
  }

  public run(
    label: string,
    work: (browser: TBrowser) => Promise<void>,
    options: RenderRunOptions = {},
  ): Promise<RenderResult> {
    if (options.skipIfBusy && this.hasWork()) {
      this.logger.log(`Render already queued or in progress, skipping ${label}`);
      return Promise.resolve({
        status: "skipped",
        reason: "render_in_progress",
      });
    }

    this.pendingCount += 1;
    const queuedWork = this.queue
      .catch(() => undefined)
      .then(() => this.execute(label, work, options))
      .finally(() => {
        this.pendingCount -= 1;
      });

    this.queue = queuedWork.catch(() => undefined);
    return queuedWork;
  }

  private async execute(
    label: string,
    work: (browser: TBrowser) => Promise<void>,
    options: RenderRunOptions,
  ): Promise<RenderResult> {
    this.renderInProgress = true;
    this.renderStartedAt = Date.now();
    let timedOut = false;

    try {
      const browser = await this.ensureBrowser({
        resetBrowserCache: options.resetBrowserCache === true,
      });
      await withTimeout(work(browser), this.renderJobTimeout, label, () => {
        timedOut = true;
      });

      if (options.updateLastSuccessfulRender !== false) {
        this.onSuccess?.();
      }

      return { status: "ok" };
    } catch (error: unknown) {
      this.logger.error(`${label} failed but server stays alive:`, error);
      if (timedOut || error instanceof OperationTimeoutError) {
        await this.closeBrowser(`${label} timeout`);
      }
      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.renderInProgress = false;
      this.renderStartedAt = null;
    }
  }
}
