import { describe, it, expect } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";
import { getFileHash } from "../../lib/hash.js";

describe("getFileHash", () => {
  let tempDir;

  async function createTempFile(content) {
    if (!tempDir) {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hash-test-"));
    }
    const filePath = path.join(tempDir, `test-${Date.now()}-${Math.random()}`);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  it("should return a sha256 hash for a file", async () => {
    const filePath = await createTempFile("hello world");
    const hash = await getFileHash(filePath);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe("string");
    expect(hash).toHaveLength(64); // SHA-256 hex is 64 chars
  });

  it("should return the same hash for the same content", async () => {
    const file1 = await createTempFile("identical content");
    const file2 = await createTempFile("identical content");
    const hash1 = await getFileHash(file1);
    const hash2 = await getFileHash(file2);
    expect(hash1).toBe(hash2);
  });

  it("should return different hashes for different content", async () => {
    const file1 = await createTempFile("content A");
    const file2 = await createTempFile("content B");
    const hash1 = await getFileHash(file1);
    const hash2 = await getFileHash(file2);
    expect(hash1).not.toBe(hash2);
  });

  it("should return null for non-existent file", async () => {
    const hash = await getFileHash("/nonexistent/path/file.png");
    expect(hash).toBeNull();
  });

  it("should handle empty files", async () => {
    const filePath = await createTempFile("");
    const hash = await getFileHash(filePath);
    expect(hash).toBeTruthy();
    expect(hash).toHaveLength(64);
  });

  it("should handle binary content", async () => {
    if (!tempDir) {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hash-test-"));
    }
    const filePath = path.join(tempDir, "binary-test");
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
    await fs.writeFile(filePath, buffer);
    const hash = await getFileHash(filePath);
    expect(hash).toBeTruthy();
    expect(hash).toHaveLength(64);
  });
});
