const {
  OperationTimeoutError,
  withTimeout
} = require("./operation-timeout");

class RenderCoordinator {
  constructor({
    renderJobTimeout,
    ensureBrowser,
    closeBrowser,
    onSuccess,
    logger = console
  }) {
    this.renderJobTimeout = renderJobTimeout;
    this.ensureBrowser = ensureBrowser;
    this.closeBrowser = closeBrowser;
    this.onSuccess = onSuccess;
    this.logger = logger;
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

    try {
      const browser = await this.ensureBrowser({
        resetBrowserCache: options.resetBrowserCache === true
      });
      await withTimeout(
        work(browser),
        this.renderJobTimeout,
        label,
        () => {
          timedOut = true;
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
}

module.exports = {
  RenderCoordinator
};
