declare module "gifenc" {
  export interface GIFEncoderInstance {
    writeFrame: (
      index: Uint8Array | number[],
      width: number,
      height: number,
      options?: {
        palette?: number[][];
        delay?: number;
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
      },
    ) => void;
    finish: () => void;
    bytes: () => Uint8Array;
    bytesView: () => Uint8Array;
    stream: () => unknown;
  }

  export function GIFEncoder(options?: {
    auto?: boolean;
    initialCapacity?: number;
  }): GIFEncoderInstance;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray | number[],
    maxColors: number,
    options?: {
      format?: string;
      clearAlpha?: boolean;
      clearAlphaThreshold?: number;
      clearAlphaColor?: number;
    },
  ): number[][];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray | number[],
    palette: number[][],
    format?: string,
  ): Uint8Array;
}
