import type { PageConfig } from "../types";

export function normalizeImageFormat(imageFormat: string | undefined): string {
  return String(imageFormat || "png").toLowerCase();
}

export function resolveOutputPath(
  pageConfig: Pick<PageConfig, "imageFormat" | "outputPath">
): string {
  const imageFormat = normalizeImageFormat(pageConfig.imageFormat);
  const extension = `.${imageFormat}`;
  let outputPath = pageConfig.outputPath;

  if (outputPath.toLowerCase().endsWith(extension)) {
    outputPath = outputPath.slice(0, -extension.length);
  }

  return `${outputPath}${extension}`;
}

export function resolveScreenshotTempPath(outputPath: string): string {
  return `${outputPath}.render.png`;
}

export function resolveFinalTempPath(
  outputPath: string,
  imageFormat: string
): string {
  return `${outputPath}.final.${normalizeImageFormat(imageFormat)}`;
}

export function getGraphicsMagickFormat(imageFormat: string): string {
  return normalizeImageFormat(imageFormat).toUpperCase();
}
