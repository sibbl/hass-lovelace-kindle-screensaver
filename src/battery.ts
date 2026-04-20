import * as http from "node:http";
import * as https from "node:https";
import type { BatteryState } from "./types";

export function sendBatteryLevelToHomeAssistant(
  pageIndex: number,
  batteryState: BatteryState,
  batteryWebHook: string,
  baseUrl: string,
  ignoreCertificateErrors: boolean,
): void {
  const batteryStatus = JSON.stringify(batteryState);
  const options = {
    method: "POST" as const,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(batteryStatus),
    },
    rejectUnauthorized: !ignoreCertificateErrors,
  };
  const url = `${baseUrl}/api/webhook/${batteryWebHook}`;
  const httpLib = url.toLowerCase().startsWith("https") ? https : http;
  const req = httpLib.request(url, options, (res) => {
    if (res.statusCode !== 200) {
      console.error(
        `Update device ${pageIndex} at ${url} status ${res.statusCode}: ${res.statusMessage}`,
      );
    }
  });
  req.on("error", (e: Error) => {
    console.error(`Update ${pageIndex} at ${url} error: ${e.message}`);
  });
  req.write(batteryStatus);
  req.end();
}
