const gm = require("gm");

function convertImageToKindleCompatiblePngAsync(
  pageConfig,
  inputPath,
  outputPath,
  useImageMagick
) {
  return new Promise((resolve, reject) => {
    let gmInstance = gm(inputPath)
      .options({
        imageMagick: useImageMagick === true,
      })
      .gamma(pageConfig.removeGamma ? 1.0 / 2.2 : 1.0)
      .modulate(100, 100 * pageConfig.saturation)
      .contrast(pageConfig.contrast)
      .dither(pageConfig.dither)
      .rotate("white", pageConfig.rotation)
      .type(pageConfig.colorMode)
      .level(pageConfig.blackLevel, pageConfig.whiteLevel)
      .bitdepth(pageConfig.grayscaleDepth);

    if (pageConfig.imageFormat !== "bmp") {
      gmInstance = gmInstance.quality(100);
    }

    gmInstance = gmInstance.strip();

    gmInstance.write(outputPath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

module.exports = { convertImageToKindleCompatiblePngAsync };
