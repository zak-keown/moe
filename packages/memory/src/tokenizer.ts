import fs from "node:fs";
import { Tokenizer } from "@huggingface/tokenizers";
import type { VerifiedModelSet } from "./model-cache.js";

const MAX_INPUT_CHARS = 2000;
const MAX_LENGTH = 512;

export interface TokenizerInputs {
  inputIds: BigInt64Array;
  attentionMask: BigInt64Array;
  tokenTypeIds: BigInt64Array;
}

export interface LoadedTokenizer {
  encode(text: string): TokenizerInputs;
}

export function loadTokenizer(model: VerifiedModelSet): LoadedTokenizer {
  const tokenizerFile = model.files.get("tokenizer.json");
  if (!tokenizerFile) throw new Error("model set missing tokenizer.json");

  const tokenizerConfigFile = model.files.get("tokenizer_config.json");

  const tokenizerJson = JSON.parse(fs.readFileSync(tokenizerFile.path, "utf-8"));
  const configJson = tokenizerConfigFile
    ? JSON.parse(fs.readFileSync(tokenizerConfigFile.path, "utf-8"))
    : {};

  const tokenizer = new Tokenizer(tokenizerJson, configJson);

  return {
    encode(text: string): TokenizerInputs {
      const truncated = text.substring(0, MAX_INPUT_CHARS);
      const encoded = tokenizer.encode(truncated, {
        add_special_tokens: true,
        return_token_type_ids: true,
      });

      const ids = encoded.ids;
      const attMask = encoded.attention_mask;
      const typeIds = encoded.token_type_ids ?? ids.map(() => 0);

      const seqLen = Math.min(ids.length, MAX_LENGTH);
      const inputIds = new BigInt64Array(MAX_LENGTH);
      const attentionMask = new BigInt64Array(MAX_LENGTH);
      const tokenTypeIds = new BigInt64Array(MAX_LENGTH);

      for (let i = 0; i < seqLen; i++) {
        inputIds[i] = BigInt(ids[i]!);
        attentionMask[i] = BigInt(attMask[i]!);
        tokenTypeIds[i] = BigInt(typeIds[i]!);
      }

      return { inputIds, attentionMask, tokenTypeIds };
    },
  };
}
