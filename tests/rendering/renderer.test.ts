import type { Browser } from "puppeteer";
import { describe, expect, it, vi } from "vitest";
import { BatteryManager } from "../../src/battery/battery-manager";
import { HomeAssistantAuth } from "../../src/browser/home-assistant-auth";
import { Renderer } from "../../src/rendering/renderer";
import { createAppConfig, createPageConfig } from "../fixtures";

function createRenderer(pageCount = 1): Renderer {
  const logger = { log: vi.fn(), error: vi.fn() };
  return new Renderer(
    createAppConfig({
      pages: Array.from({ length: pageCount }, () => createPageConfig())
    }),
    new HomeAssistantAuth(logger),
    new BatteryManager(false, logger),
    logger
  );
}

describe("renderer", () => {
  it("continues rendering later pages and aggregates failures", async () => {
    const renderer = createRenderer(2);
    const renderPage = vi
      .spyOn(renderer, "renderPage")
      .mockRejectedValueOnce(new Error("first page failed"))
      .mockResolvedValueOnce(undefined);
    const browser = {} as Browser;

    await expect(renderer.renderAll(browser)).rejects.toThrow(
      "1 render page(s) failed"
    );
    expect(renderPage).toHaveBeenNthCalledWith(1, browser, 0);
    expect(renderPage).toHaveBeenNthCalledWith(2, browser, 1);
  });

  it("rejects unknown page indexes before touching the filesystem", async () => {
    const renderer = createRenderer();

    await expect(renderer.renderPage({} as Browser, 10)).rejects.toThrow(
      "Unknown render page index 10"
    );
  });
});
