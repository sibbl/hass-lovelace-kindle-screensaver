const {
  OperationAbortedError,
  OperationTimeoutError,
  withTimeout
} = require("./operation-timeout");

class RenderCoordinator {
  constructor({
    renderJobTimeout,
    ensureBrowser,
    closeBrowser,
    onSuccess,
    logger = console,
    cleanupTimeout = 5000
  }) {
    this.renderJobTimeout = renderJobTimeout;
    this.ensureBrowser = ensureBrowser;
    this.closeBrowser = closeBrowser;
    this.onSuccess = onSuccess;
    this.logger = logger;
    this.cleanupTimeout = cleanupTimeout;
    this.queue = Promise.resolve();
    this.pendingCount = 0;
    this.renderInProgress = false;
    this.renderStartedAt = null;
  }

  hasWork() {
    return this.pendingCount > 0;
  }

  getState(now = Date.now()) {
    return {
      renderInProgress: this.renderInProgress,
      renderInProgressFor: this.renderStartedAt
        ? now - this.renderStartedAt
        : null
    };
  }

  run(label, work, options = {}) {
    if (options.skipIfBusy && this.hasWork()) {
      this.logger.log(`Render already queued or in progress, skipping ${label}`);
      return Promise.resolve({
        status: "skipped",
        reason: "render_in_progress"
      });
    }

    this.pendingCount++;
    const queuedWork = this.queue
      .catch(() => {})
      .then(() => this.execute(label, work, options))
      .finally(() => {
        this.pendingCount--;
      });

    this.queue = queuedWork.catch(() => {});
    return queuedWork;
  }

  async execute(label, work, options) {
    this.renderInProgress = true;
    this.renderStartedAt = Date.now();
    let timedOut = false;
    const abortController = new AbortController();
    let workPromise = null;

    try {
      const browser = await this.ensureBrowser({
        resetBrowserCache: options.resetBrowserCache === true
      });
      workPromise = Promise.resolve().then(() => {
        return work(browser, { signal: abortController.signal });
      });
      await withTimeout(
        workPromise,
        this.renderJobTimeout,
        label,
        () => {
          timedOut = true;
          abortController.abort();
        }
      );

      if (options.updateLastSuccessfulRender !== false && this.onSuccess) {
        this.onSuccess();
      }

      return { status: "ok" };
    } catch (err) {
      this.logger.error(`${label} failed but server stays alive:`, err);
      if (timedOut || err instanceof OperationTimeoutError) {
        await this.closeBrowser(`${label} timeout`);
        await this.waitForTimedOutWork(label, workPromise);
      }
      return {
        status: "failed",
        error: err && err.message ? err.message : String(err)
      };
    } finally {
      this.renderInProgress = false;
      this.renderStartedAt = null;
    }
  }

  async waitForTimedOutWork(label, workPromise) {
    if (!workPromise) {
      return;
    }

    let cleanupTimedOut = false;
    try {
      await withTimeout(
        workPromise.catch((err) => {
          if (!(err instanceof OperationAbortedError)) {
            this.logger.error(`${label} cleanup finished after error:`, err);
          }
        }),
        this.cleanupTimeout,
        `${label} cleanup`,
        () => {
          cleanupTimedOut = true;
        }
      );
    } catch (err) {
      if (cleanupTimedOut || err instanceof OperationTimeoutError) {
        this.logger.error(
          `${label} cleanup did not finish after ${this.cleanupTimeout}ms`
        );
        return;
      }

      this.logger.error(`${label} cleanup failed:`, err);
    }
  }
}

module.exports = {
  RenderCoordinator
};
