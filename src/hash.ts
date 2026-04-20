import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";

export async function getFileHash(filePath: string): Promise<string | null> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  } catch {
    return null;
  }
}
