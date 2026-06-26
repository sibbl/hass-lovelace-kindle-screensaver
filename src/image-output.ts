import type { ImageFormat, PageConfig } from "./types";

export function normalizeImageFormat(imageFormat: string | undefined): ImageFormat {
  const normalizedValue = String(imageFormat ?? "png").toLowerCase();
  if (
    normalizedValue === "png" ||
    normalizedValue === "jpeg" ||
    normalizedValue === "bmp"
  ) {
    return normalizedValue;
  }

  return "png";
}

export function resolveOutputPath(pageConfig: Pick<PageConfig, "imageFormat" | "outputPath">): string {
  const imageFormat = normalizeImageFormat(pageConfig.imageFormat);
  const extension = `.${imageFormat}`;
  const rawOutputPath = pageConfig.outputPath;

  if (rawOutputPath.toLowerCase().endsWith(extension)) {
    return `${rawOutputPath.slice(0, -extension.length)}${extension}`;
  }

  return `${rawOutputPath}${extension}`;
}

export function resolveScreenshotTempPath(outputPath: string): string {
  return `${outputPath}.render.png`;
}

export function resolveFinalTempPath(
  outputPath: string,
  imageFormat: ImageFormat
): string {
  return `${outputPath}.final.${normalizeImageFormat(imageFormat)}`;
}

export function getGraphicsMagickFormat(imageFormat: ImageFormat): string {
  return normalizeImageFormat(imageFormat).toUpperCase();
}
