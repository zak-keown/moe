import type { VerifiedModelSet } from "./model-cache.js";
export interface TokenizerInputs {
    inputIds: BigInt64Array;
    attentionMask: BigInt64Array;
    tokenTypeIds: BigInt64Array;
}
export interface LoadedTokenizer {
    encode(text: string): TokenizerInputs;
}
export declare function loadTokenizer(model: VerifiedModelSet): LoadedTokenizer;
