import type { Browser } from "puppeteer";

export type ImageFormat = "png" | "jpeg" | "bmp";
export type ColorMode = "GrayScale" | "TrueColor";
export type PreferredColorScheme = "light" | "dark";

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

export interface PageConfig {
  readonly screenShotUrl: string;
  readonly imageFormat: ImageFormat;
  readonly outputPath: string;
  readonly renderingDelay: number;
  readonly renderingScreenSize: ScreenSize;
  readonly grayscaleDepth: number;
  readonly removeGamma: boolean;
  readonly blackLevel: string;
  readonly whiteLevel: string;
  readonly dither: boolean;
  readonly colorMode: ColorMode;
  readonly prefersColorScheme: PreferredColorScheme;
  readonly rotation: number;
  readonly scaling: number;
  readonly batteryWebHook: string | null;
  readonly saturation: number;
  readonly contrast: number;
}

export interface AppConfig {
  readonly baseUrl: string | undefined;
  readonly accessToken: string | undefined;
  readonly cronJob: string;
  readonly useImageMagick: boolean;
  readonly pages: readonly PageConfig[];
  readonly port: number;
  readonly renderingTimeout: number;
  readonly browserLaunchTimeout: number;
  readonly browserCacheTtlSeconds: number;
  readonly browserCacheTtl: number;
  readonly language: string;
  readonly theme: HomeAssistantTheme | null;
  readonly debug: boolean;
  readonly ignoreCertificateErrors: boolean;
  readonly httpAuthUser: string | null;
  readonly httpAuthPassword: string | null;
}

export interface HomeAssistantTheme {
  readonly theme: string;
}

export interface BatteryState {
  batteryLevel: number | null;
  isCharging: boolean;
}

export type BatteryStore = Record<number, BatteryState>;

export interface RenderContext {
  readonly signal: AbortSignal;
}

export interface BrowserProvider {
  readonly ensureBrowser: (options: BrowserRequestOptions) => Promise<Browser>;
  readonly closeBrowser: (reason: string) => Promise<void>;
  readonly getStartedAt: () => number | null;
}

export interface BrowserRequestOptions {
  readonly resetBrowserCache: boolean;
}

export type RenderSuccess = {
  readonly status: "ok";
};

export type RenderSkipped = {
  readonly status: "skipped";
  readonly reason: "render_in_progress";
};

export type RenderFailure = {
  readonly status: "failed";
  readonly error: string;
};

export type RenderResult = RenderSuccess | RenderSkipped | RenderFailure;

export interface RenderRunOptions {
  readonly skipIfBusy?: boolean;
  readonly resetBrowserCache?: boolean;
  readonly updateLastSuccessfulRender?: boolean;
}

export interface RenderState {
  readonly renderInProgress: boolean;
  readonly renderInProgressFor: number | null;
}

export interface Logger {
  readonly log: (message: string) => void;
  readonly error: (message: string, error?: Error) => void;
}
