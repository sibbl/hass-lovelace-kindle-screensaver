import { describe, expect, it, vi } from "vitest";
import {
  getBatteryState,
  updateBatteryStore
} from "./battery-store";
import type { BatteryStore } from "./types";

describe("battery store", () => {
  it("stores valid battery level and charging state for a page", () => {
    const batteryStore: BatteryStore = {};

    updateBatteryStore(batteryStore, 0, 1, 42, "Yes");

    expect(getBatteryState(batteryStore, 0)).toEqual({
      batteryLevel: 42,
      isCharging: true
    });
  });

  it("ignores out-of-range battery levels without changing state", () => {
    const batteryStore: BatteryStore = {};
    updateBatteryStore(batteryStore, 1, 2, 75, "No");

    updateBatteryStore(batteryStore, 1, 2, 101, "Yes");

    expect(getBatteryState(batteryStore, 1)).toEqual({
      batteryLevel: 75,
      isCharging: false
    });
  });

  it("does not log unchanged battery state", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const batteryStore: BatteryStore = {};

    updateBatteryStore(batteryStore, 0, 1, 50, "No");
    logSpy.mockClear();
    updateBatteryStore(batteryStore, 0, 1, 50, "No");

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
