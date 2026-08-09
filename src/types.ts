import type { Browser } from "puppeteer";

export interface Logger {
  log(...values: unknown[]): void;
  error(...values: unknown[]): void;
}

export interface HomeAssistantTheme {
  theme: string;
}

export interface RenderingScreenSize {
  height: number;
  width: number;
}

export interface PageConfig {
  baseUrl: string;
  accessToken: string;
  screenShotUrl: string;
  language: string;
  theme: HomeAssistantTheme | null;
  imageFormat: string;
  outputPath: string;
  renderingDelay: number;
  renderingScreenSize: RenderingScreenSize;
  grayscaleDepth: number;
  removeGamma: boolean;
  blackLevel: string;
  whiteLevel: string;
  dither: boolean;
  colorMode: string;
  prefersColorScheme: string;
  rotation: number;
  scaling: number;
  batteryWebHook: string | null;
  saturation: number;
  contrast: number;
  httpAuthUser: string | null;
  httpAuthPassword: string | null;
}

export interface AppConfig {
  baseUrl: string | undefined;
  accessToken: string | undefined;
  cronJob: string;
  useImageMagick: boolean;
  pages: PageConfig[];
  port: number;
  renderingTimeout: number;
  browserLaunchTimeout: number;
  browserCacheTtlSeconds: number;
  browserCacheTtl: number;
  language: string;
  theme: HomeAssistantTheme | null;
  debug: boolean;
  ignoreCertificateErrors: boolean;
  httpAuthUser: string | null;
  httpAuthPassword: string | null;
}

export interface EnsureBrowserOptions {
  resetBrowserCache?: boolean;
}

export interface RenderRunOptions extends EnsureBrowserOptions {
  skipIfBusy?: boolean;
  updateLastSuccessfulRender?: boolean;
}

export type RenderResult =
  | { status: "ok" }
  | { status: "skipped"; reason: "render_in_progress" }
  | { status: "failed"; error: string };

export interface RenderState {
  renderInProgress: boolean;
  renderInProgressFor: number | null;
}

export type RenderWork = (browser: Browser) => Promise<void>;

export interface BatteryStatus {
  batteryLevel: number | null;
  isCharging: boolean;
}
