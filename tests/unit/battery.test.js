import { describe, it, expect, afterAll, afterEach } from "vitest";
import http from "node:http";
import { sendBatteryLevelToHomeAssistant } from "../../src/battery";

describe("sendBatteryLevelToHomeAssistant", () => {
  let mockServer;

  afterEach(async () => {
    if (mockServer) {
      await new Promise((resolve) => mockServer.close(resolve));
      mockServer = null;
    }
  });

  afterAll(async () => {
    if (mockServer) {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  });

  it("should POST battery status to webhook endpoint", async () => {
    const receivedData = await new Promise((resolve) => {
      mockServer = http.createServer((req, res) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
          res.writeHead(200);
          res.end();
          resolve({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: Buffer.concat(chunks).toString(),
          });
        });
      });

      mockServer.listen(0, "127.0.0.1", () => {
        const port = mockServer.address().port;
        const batteryStore = { batteryLevel: 75, isCharging: true };
        sendBatteryLevelToHomeAssistant(
          0,
          batteryStore,
          "kindle_battery",
          `http://127.0.0.1:${port}`,
          false,
        );
      });
    });

    expect(receivedData.method).toBe("POST");
    expect(receivedData.url).toBe("/api/webhook/kindle_battery");
    expect(receivedData.headers["content-type"]).toBe("application/json");
    const parsed = JSON.parse(receivedData.body);
    expect(parsed.batteryLevel).toBe(75);
    expect(parsed.isCharging).toBe(true);
  });

  it("should handle server errors gracefully", async () => {
    await new Promise((resolve) => {
      mockServer = http.createServer((req, res) => {
        res.writeHead(500);
        res.end("Internal Server Error");
        // Give a moment for the error handler to fire
        setTimeout(resolve, 100);
      });

      mockServer.listen(0, "127.0.0.1", () => {
        const port = mockServer.address().port;
        const batteryStore = { batteryLevel: 50, isCharging: false };
        sendBatteryLevelToHomeAssistant(
          0,
          batteryStore,
          "kindle_battery",
          `http://127.0.0.1:${port}`,
          false,
        );
      });
    });
    // Should not throw
  });
});
