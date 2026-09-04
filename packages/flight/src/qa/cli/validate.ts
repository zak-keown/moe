import { readFileSync } from "node:fs";
import { parseStoryCard } from "../format/story-card.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateScenario(path: string): ValidationResult {
  const errors: string[] = [];

  try {
    const content = readFileSync(path, "utf-8");
    parseStoryCard(content);
  } catch (err) {
    errors.push((err as Error).message);
  }

  return { valid: errors.length === 0, errors };
}
