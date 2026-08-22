declare module "gifuct-js" {
  export interface ParsedFrame {
    dims: {
      width: number;
      height: number;
      top: number;
      left: number;
    };
    delay: number;
    disposalType: number;
    patch: Uint8ClampedArray;
    transparentIndex?: number;
  }

  export interface ParsedGIF {
    frames: unknown[];
    lsd: {
      width: number;
      height: number;
    };
  }

  export function parseGIF(arrayBuffer: ArrayBuffer): ParsedGIF;
  export function decompressFrames(
    parsedGif: ParsedGIF,
    buildPatch: boolean,
  ): ParsedFrame[];
}
