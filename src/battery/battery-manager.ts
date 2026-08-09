import http from "node:http";
import https from "node:https";
import type { BatteryStatus, Logger, PageConfig } from "../types";

export class BatteryManager {
  private readonly batteryStore = new Map<number, BatteryStatus>();
  private readonly ignoreCertificateErrors: boolean;
  private readonly logger: Logger;

  public constructor(ignoreCertificateErrors: boolean, logger: Logger = console) {
    this.ignoreCertificateErrors = ignoreCertificateErrors;
    this.logger = logger;
  }

  public get(pageIndex: number): BatteryStatus | undefined {
    return this.batteryStore.get(pageIndex);
  }

  public update(
    pageIndex: number,
    pageNumber: number,
    batteryLevel: number,
    isCharging: string | null,
  ): void {
    let batteryStatus = this.batteryStore.get(pageIndex);
    if (!batteryStatus) {
      batteryStatus = {
        batteryLevel: null,
        isCharging: false,
      };
      this.batteryStore.set(pageIndex, batteryStatus);
    }

    if (Number.isNaN(batteryLevel) || batteryLevel < 0 || batteryLevel > 100) {
      return;
    }

    if (batteryLevel !== batteryStatus.batteryLevel) {
      batteryStatus.batteryLevel = batteryLevel;
      this.logger.log(`New battery level: ${batteryLevel} for page ${pageNumber}`);
    }

    if ((isCharging === "Yes" || isCharging === "1") && !batteryStatus.isCharging) {
      batteryStatus.isCharging = true;
      this.logger.log(`Battery started charging for page ${pageNumber}`);
    } else if ((isCharging === "No" || isCharging === "0") && batteryStatus.isCharging) {
      batteryStatus.isCharging = false;
      this.logger.log(`Battery stopped charging for page ${pageNumber}`);
    }
  }

  public sendAfterRender(pageIndex: number, pageConfig: PageConfig): void {
    const batteryStatus = this.batteryStore.get(pageIndex);
    if (!batteryStatus || batteryStatus.batteryLevel === null || !pageConfig.batteryWebHook) {
      return;
    }

    this.sendBatteryLevelToHomeAssistant(
      pageIndex,
      batteryStatus,
      pageConfig.baseUrl,
      pageConfig.batteryWebHook,
    );
  }

  private sendBatteryLevelToHomeAssistant(
    pageIndex: number,
    batteryStatus: BatteryStatus,
    baseUrl: string,
    batteryWebHook: string,
  ): void {
    const requestBody = JSON.stringify(batteryStatus);
    const options: https.RequestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
      },
      rejectUnauthorized: !this.ignoreCertificateErrors,
    };
    const url = `${baseUrl}/api/webhook/${batteryWebHook}`;
    const httpLibrary = url.toLowerCase().startsWith("https") ? https : http;
    const request = httpLibrary.request(url, options, (response) => {
      if (response.statusCode !== 200) {
        this.logger.error(
          `Update device ${pageIndex} at ${url} status ${response.statusCode}: ${response.statusMessage}`,
        );
      }
    });
    request.on("error", (error: Error) => {
      this.logger.error(`Update ${pageIndex} at ${url} error: ${error.message}`);
    });
    request.write(requestBody);
    request.end();
  }
}
