import type { BatteryState, BatteryStore } from "./types";

export function updateBatteryStore(
  batteryStore: BatteryStore,
  pageIndex: number,
  pageNumber: number,
  batteryLevel: number,
  isCharging: string | null
): void {
  const pageBatteryStore = getOrCreateBatteryState(batteryStore, pageIndex);

  if (!Number.isFinite(batteryLevel) || batteryLevel < 0 || batteryLevel > 100) {
    return;
  }

  if (batteryLevel !== pageBatteryStore.batteryLevel) {
    pageBatteryStore.batteryLevel = batteryLevel;
    console.log(`New battery level: ${batteryLevel} for page ${pageNumber}`);
  }

  if (
    (isCharging === "Yes" || isCharging === "1") &&
    pageBatteryStore.isCharging !== true
  ) {
    pageBatteryStore.isCharging = true;
    console.log(`Battery started charging for page ${pageNumber}`);
  } else if (
    (isCharging === "No" || isCharging === "0") &&
    pageBatteryStore.isCharging !== false
  ) {
    console.log(`Battery stopped charging for page ${pageNumber}`);
    pageBatteryStore.isCharging = false;
  }
}

export function getBatteryState(
  batteryStore: BatteryStore,
  pageIndex: number
): BatteryState | undefined {
  return batteryStore[pageIndex];
}

function getOrCreateBatteryState(
  batteryStore: BatteryStore,
  pageIndex: number
): BatteryState {
  const existingState = batteryStore[pageIndex];
  if (existingState) {
    return existingState;
  }

  const nextState: BatteryState = {
    batteryLevel: null,
    isCharging: false
  };
  batteryStore[pageIndex] = nextState;
  return nextState;
}
