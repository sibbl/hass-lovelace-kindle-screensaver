export interface PageConfig {
  screenShotUrl: string;
  imageFormat: "png" | "jpeg" | "bmp";
  outputPath: string;
  renderingDelay: number;
  renderingScreenSize: {
    height: number;
    width: number;
  };
  grayscaleDepth: number;
  removeGamma: boolean;
  blackLevel: string;
  whiteLevel: string;
  dither: boolean;
  colorMode: "GrayScale" | "TrueColor";
  prefersColorScheme: "light" | "dark";
  rotation: number;
  scaling: number;
  batteryWebHook: string | null;
  saturation: number;
  contrast: number;
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
  language: string;
  theme: { theme: string } | null;
  debug: boolean;
  ignoreCertificateErrors: boolean;
  httpAuthUser: string | null;
  httpAuthPassword: string | null;
}

export interface BatteryState {
  batteryLevel: number | null;
  isCharging: boolean;
}

export type BatteryStore = Record<number, BatteryState | undefined>;
