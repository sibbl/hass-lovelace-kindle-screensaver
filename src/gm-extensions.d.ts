import "gm";

declare module "gm" {
  interface State {
    options(options: ClassOptions): State;
    gamma(value: number): State;
    level(blackPoint: string, whitePoint: string): State;
  }
}
