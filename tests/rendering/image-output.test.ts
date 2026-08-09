import { describe, expect, it } from "vitest";
import {
  getGraphicsMagickFormat,
  normalizeImageFormat,
  resolveFinalTempPath,
  resolveOutputPath,
  resolveScreenshotTempPath,
} from "../../src/rendering/image-output";

describe("image output paths", () => {
  it("appends the configured image format", () => {
    expect(resolveOutputPath({ outputPath: "/output/cover", imageFormat: "jpeg" })).toBe(
      "/output/cover.jpeg",
    );
  });

  it("does not duplicate an existing matching extension", () => {
    expect(resolveOutputPath({ outputPath: "/output/cover.bmp", imageFormat: "bmp" })).toBe(
      "/output/cover.bmp",
    );
  });

  it("matches existing extensions case-insensitively", () => {
    expect(resolveOutputPath({ outputPath: "/output/cover.PNG", imageFormat: "png" })).toBe(
      "/output/cover.png",
    );
  });

  it("uses explicit formats for temporary files", () => {
    expect(resolveScreenshotTempPath("/output/cover.jpeg")).toBe("/output/cover.jpeg.render.png");
    expect(resolveFinalTempPath("/output/cover.jpeg", "jpeg")).toBe(
      "/output/cover.jpeg.final.jpeg",
    );
  });

  it("normalizes formats for paths and GraphicsMagick", () => {
    expect(normalizeImageFormat("JPEG")).toBe("jpeg");
    expect(getGraphicsMagickFormat("jpeg")).toBe("JPEG");
    expect(getGraphicsMagickFormat("bmp")).toBe("BMP");
  });
});
