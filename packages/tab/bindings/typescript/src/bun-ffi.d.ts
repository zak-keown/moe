// Ambient declaration for the `bun:ffi` builtin, narrowed to exactly the surface
// `ffi-bun.ts` and `pricing-env.ts` use.
//
// Upstream never typechecked this package (its package.json carried no scripts),
// so these imports were unresolved. The alternative — depending on `bun-types` —
// pulls Bun's whole global environment into a package that also builds for Node.
// Declaring the handful of symbols we call is smaller, and keeps the Node build
// honest about what it does not have.
declare module "bun:ffi" {
  /** Bun's FFIType is a numeric enum; the members are opaque tokens to us. */
  export const FFIType: {
    readonly ptr: number;
    readonly void: number;
    readonly cstring: number;
    readonly i32: number;
  };

  /** One symbol's ABI: argument types and return type, as FFIType members. */
  interface SymbolSpec {
    args: readonly number[];
    returns: number;
  }

  /**
   * What a bound C symbol accepts: a pointer/int, a NUL-terminated buffer, or NULL.
   * Every symbol this package binds returns an i32, a pointer, or void — all of
   * which arrive as a JS number (the void ones are ignored at the call site).
   */
  type FfiArg = number | Uint8Array | null;
  type BoundSymbol = (...args: FfiArg[]) => number;

  export function dlopen<T extends Record<string, SymbolSpec>>(
    path: string,
    symbols: T,
  ): { symbols: Record<keyof T, BoundSymbol>; close(): void };

  /** Address of a TypedArray's backing buffer. */
  export function ptr(view: ArrayBufferView): number;

  /** Reads the NUL-terminated C string at `address`. Does not free it. */
  export class CString extends String {
    constructor(address: number, byteOffset?: number, byteLength?: number);
  }
}
