import { describe, expect, it } from "vitest";
import {
  getGraphicsMagickFormat,
  normalizeImageFormat,
  resolveFinalTempPath,
  resolveOutputPath,
  resolveScreenshotTempPath
} from "./image-output";

describe("image output paths", () => {
  it("appends the configured image format", () => {
    expect(
      resolveOutputPath({
        outputPath: "/output/cover",
        imageFormat: "jpeg"
      })
    ).toBe("/output/cover.jpeg");
  });

  it("does not duplicate an existing matching extension", () => {
    expect(
      resolveOutputPath({
        outputPath: "/output/cover.bmp",
        imageFormat: "bmp"
      })
    ).toBe("/output/cover.bmp");
  });

  it("matches existing extensions case-insensitively", () => {
    expect(
      resolveOutputPath({
        outputPath: "/output/cover.PNG",
        imageFormat: "png"
      })
    ).toBe("/output/cover.png");
  });

  it("keeps screenshot temp files explicitly png", () => {
    expect(resolveScreenshotTempPath("/output/cover.jpeg")).toBe(
      "/output/cover.jpeg.render.png"
    );
  });

  it("keeps converted temp files in the configured final format", () => {
    expect(resolveFinalTempPath("/output/cover.jpeg", "jpeg")).toBe(
      "/output/cover.jpeg.final.jpeg"
    );
    expect(resolveFinalTempPath("/output/cover.bmp", "bmp")).toBe(
      "/output/cover.bmp.final.bmp"
    );
  });
});

describe("image output formats", () => {
  it("normalizes image formats for config and GraphicsMagick", () => {
    expect(normalizeImageFormat("JPEG")).toBe("jpeg");
    expect(getGraphicsMagickFormat("jpeg")).toBe("JPEG");
    expect(getGraphicsMagickFormat("bmp")).toBe("BMP");
  });

  it("falls back to png for unsupported formats", () => {
    expect(normalizeImageFormat("webp")).toBe("png");
  });
});
