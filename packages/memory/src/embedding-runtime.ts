import fs from "node:fs";
import * as ort from "onnxruntime-web";
import type { VerifiedModelSet } from "./model-cache.js";
import { type LoadedTokenizer, loadTokenizer } from "./tokenizer.js";

export interface EmbeddingBackend {
  embed(text: string): Promise<Float32Array>;
  embedQuery(text: string): Promise<Float32Array>;
  close(): Promise<void>;
  debugInputTypes?(): string[];
}

export interface VerifiedRuntimeAsset {
  path: string;
  sha256: string;
  bytes: number;
}

export async function createEmbeddingBackend(
  model: VerifiedModelSet,
  wasm: VerifiedRuntimeAsset,
): Promise<EmbeddingBackend> {
  ort.env.wasm.proxy = false;
  ort.env.wasm.numThreads = 1;

  const tokenizer = loadTokenizer(model);
  const modelFile = model.files.get("model_quantized.onnx");
  if (!modelFile) throw new Error("model set missing model_quantized.onnx");

  const modelBuffer = fs.readFileSync(modelFile.path);
  const session = await ort.InferenceSession.create(modelBuffer.buffer as ArrayBuffer, {
    executionProviders: ["wasm"],
  });

  const inputNames = session.inputNames;

  return {
    async embed(text: string): Promise<Float32Array> {
      return runInference(session, tokenizer, text);
    },

    async embedQuery(text: string): Promise<Float32Array> {
      const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
      const prefixed = text.startsWith(BGE_QUERY_PREFIX) ? text : BGE_QUERY_PREFIX + text;
      return runInference(session, tokenizer, prefixed);
    },

    async close(): Promise<void> {
      await session.release();
    },

    debugInputTypes(): string[] {
      return inputNames.map((name) => {
        const meta = session.inputNames.includes(name) ? "int64" : "unknown";
        return meta;
      });
    },
  };
}

async function runInference(
  session: ort.InferenceSession,
  tokenizer: LoadedTokenizer,
  text: string,
): Promise<Float32Array> {
  const inputs = tokenizer.encode(text);
  const seqLen = inputs.inputIds.length;

  const feeds: Record<string, ort.Tensor> = {
    input_ids: new ort.Tensor("int64", inputs.inputIds, [1, seqLen]),
    attention_mask: new ort.Tensor("int64", inputs.attentionMask, [1, seqLen]),
    token_type_ids: new ort.Tensor("int64", inputs.tokenTypeIds, [1, seqLen]),
  };

  const results = await session.run(feeds);
  const outputKey = session.outputNames[0]!;
  const output = results[outputKey]!;
  const data = output.data as Float32Array;

  const hiddenSize = data.length / seqLen;
  const pooled = maskedMeanPool(data, inputs.attentionMask, seqLen, hiddenSize);
  return l2Normalize(pooled);
}

function maskedMeanPool(
  data: Float32Array,
  attentionMask: BigInt64Array,
  seqLen: number,
  hiddenSize: number,
): Float32Array {
  const result = new Float32Array(hiddenSize);
  let maskSum = 0;

  for (let i = 0; i < seqLen; i++) {
    const mask = Number(attentionMask[i]);
    if (mask === 0) continue;
    maskSum += mask;
    const offset = i * hiddenSize;
    for (let j = 0; j < hiddenSize; j++) {
      result[j] = result[j]! + data[offset + j]! * mask;
    }
  }

  if (maskSum > 0) {
    for (let j = 0; j < hiddenSize; j++) {
      result[j] = result[j]! / maskSum;
    }
  }

  return result;
}

function l2Normalize(vector: Float32Array): Float32Array {
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] = vector[i]! / norm;
    }
  }
  return vector;
}
