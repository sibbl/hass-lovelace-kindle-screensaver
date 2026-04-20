const crypto = require("crypto");
const { promises: fs } = require("fs");

async function getFileHash(filePath) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  } catch (error) {
    return null;
  }
}

module.exports = { getFileHash };
