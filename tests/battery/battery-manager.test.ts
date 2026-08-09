import { describe, expect, it, vi } from "vitest";
import { BatteryManager } from "../../src/battery/battery-manager";

describe("battery manager", () => {
  it("stores valid battery and charging updates per page", () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const manager = new BatteryManager(false, logger);

    manager.update(0, 1, 75, "Yes");
    manager.update(1, 2, 40, "No");

    expect(manager.get(0)).toEqual({ batteryLevel: 75, isCharging: true });
    expect(manager.get(1)).toEqual({ batteryLevel: 40, isCharging: false });
  });

  it("ignores battery values outside the accepted range", () => {
    const manager = new BatteryManager(false, {
      log: vi.fn(),
      error: vi.fn()
    });

    manager.update(0, 1, 101, "Yes");
    expect(manager.get(0)).toEqual({ batteryLevel: null, isCharging: false });
  });

  it("tracks charging transitions without replacing the battery level", () => {
    const manager = new BatteryManager(false, {
      log: vi.fn(),
      error: vi.fn()
    });

    manager.update(0, 1, 50, "Yes");
    manager.update(0, 1, 50, "No");
    expect(manager.get(0)).toEqual({ batteryLevel: 50, isCharging: false });
  });
});
