import gm from "gm";
import type { PageConfig } from "./types";

export function convertImageToKindleCompatiblePngAsync(
  pageConfig: PageConfig,
  inputPath: string,
  outputPath: string,
  useImageMagick: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const gmModule = useImageMagick ? gm.subClass({ imageMagick: true }) : gm;
    const gammaValue = pageConfig.removeGamma ? 1 / 2.2 : 1;
    let gmInstance = gmModule(inputPath)
      .gamma(gammaValue, gammaValue, gammaValue)
      .modulate(100, 100 * pageConfig.saturation)
      .contrast(pageConfig.contrast)
      .dither(pageConfig.dither)
      .rotate("white", pageConfig.rotation)
      .type(pageConfig.colorMode)
      .out("-level", `${pageConfig.blackLevel},${pageConfig.whiteLevel}`)
      .bitdepth(pageConfig.grayscaleDepth);

    if (pageConfig.imageFormat !== "bmp") {
      gmInstance = gmInstance.quality(100);
    }

    gmInstance = gmInstance.strip();

    gmInstance.write(outputPath, (err: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
