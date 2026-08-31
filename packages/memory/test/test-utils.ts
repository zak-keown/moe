import fs from "node:fs";
import path from "node:path";

/**
 * Suppress console output during test execution
 */
export function suppressConsole(): () => void {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};

  return () => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  };
}

/**
 * Get path to test fixture file.
 *
 * Was a bare `__dirname`, which works under vitest's transform but does not
 * typecheck in an ESM `.ts` file — invisible upstream because its tsconfig
 * excluded `test/` entirely.
 */
export function getFixturePath(filename: string): string {
  return path.join(import.meta.dirname, "fixtures", filename);
}

/**
 * Read a test fixture file
 */
export function readFixture(filename: string): string {
  return fs.readFileSync(getFixturePath(filename), "utf-8");
}

/**
 * Count lines in a file
 */
export function countLines(filePath: string): number {
  const content = fs.readFileSync(filePath, "utf-8");
  return content.trim().split("\n").length;
}

/**
 * A deterministic stand-in for the real encoder: a hashed bag of words.
 *
 * Lets the offline project exercise retrieval end to end — write, index, KNN,
 * rank — without a 35 MB model download. Word-level rather than character-level
 * on purpose, so shared vocabulary actually dominates the cosine and a ranking
 * assertion means something. It is not semantic: a paraphrase with no shared
 * words scores near zero, which is why the real-encoder round trip lives in
 * test/model/journal-encoder.test.ts.
 *
 * Contrast private-journal-mcp's own harness, which mocked its encoder to return
 * the SAME five-element vector for every input — so every cosine was exactly 1.0
 * and both of its "semantic" assertions passed vacuously.
 *
 * Unit-normalised, because src/search.ts's l2-to-cosine conversion is valid only
 * for unit vectors.
 */
export function fakeEmbed(dimensions = 384): (text: string) => Promise<number[]> {
  return async (text: string) => {
    const vector = new Array<number>(dimensions).fill(0);
    for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (!word) continue;
      let hash = 2166136261;
      for (let i = 0; i < word.length; i++) {
        hash ^= word.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      const slot = Math.abs(hash) % dimensions;
      vector[slot] = (vector[slot] ?? 0) + 1;
    }
    let norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) {
      vector[0] = 1;
      norm = 1;
    }
    return vector.map((v) => v / norm);
  };
}
