import type { StoryCard } from "../format/story-card.js";
import { parseStoryCard } from "../format/story-card.js";
import type { LLMClient } from "../models/provider.js";
import type { VerdictResult } from "../types.js";

export function buildFanoutPrompt(card: StoryCard): string {
  return `You are a QA test designer. Given a story card, generate variation scenarios that test edge cases, error paths, alternate personas, and boundary conditions.

Each variation is a story card in the same format. Each MUST include:
- A unique id (use the parent id with a suffix, e.g., story-001-a, story-001-b)
- parent: ${card.id}
- A clear title describing the variation
- A description explaining what this variation tests
- Acceptance criteria (at least one)

## Parent Story Card

**ID:** ${card.id}
**Title:** ${card.title}
${card.stakeholder ? `**Stakeholder:** ${card.stakeholder}` : ""}

${card.description}

${card.acceptanceCriteria.length > 0 ? `## Acceptance Criteria\n${card.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}` : ""}

## Generate Variations

Think about:
- Edge cases (empty input, very long input, special characters)
- Error paths (network failure, invalid state, permission denied)
- Alternate personas (new user, power user, admin, mobile user)
- Boundary conditions (first item, last item, maximum items)
- Negative testing (what should NOT happen)

Generate 3-5 variations. Separate each card with a "---CARD---" marker.

Each card MUST use this exact format (triple-dash frontmatter, NOT code fences):

---
id: ${card.id}-a
title: Example variation title
status: draft
tags: edge-case
parent: ${card.id}
---

Description of what this variation tests.

## Acceptance Criteria

- First criterion
- Second criterion`;
}

export async function generateFanout(card: StoryCard, client: LLMClient): Promise<string[]> {
  const prompt = buildFanoutPrompt(card);
  const response = await client.chat(
    [client.userMessage(prompt)],
    [],
    "You are a QA test designer. Output story cards in markdown format.",
  );

  return splitAndValidateCards(response.text);
}

// A bare fence-marker line: an opening ```lang or a closing ```.
const FENCE_MARKER_LINE_RE = /^```\w*$/;

/**
 * Strip a code fence that wraps the *entire* given text — i.e. its first
 * non-blank line opens a fence and its last non-blank line closes one.
 * Only those two boundary lines are removed; anything in between (including
 * a fence-looking line that is part of the content itself) is left alone.
 * Returns `text` unchanged if it is not fence-wrapped end-to-end.
 */
function stripOuterCodeFence(text: string): string {
  const lines = text.split("\n");
  let start = 0;
  while (start < lines.length && lines[start]?.trim() === "") start++;
  let end = lines.length - 1;
  while (end >= 0 && lines[end]?.trim() === "") end--;
  if (start >= end) return text;

  const first = lines[start]?.trim() ?? "";
  const last = lines[end]?.trim() ?? "";
  if (!FENCE_MARKER_LINE_RE.test(first) || last !== "```") return text;

  return lines.slice(start + 1, end).join("\n");
}

function countFenceMarkerLines(text: string): number {
  return text.split("\n").filter((l) => FENCE_MARKER_LINE_RE.test(l.trim())).length;
}

export function splitAndValidateCards(text: string): string[] {
  // Strip a markdown code fence that wraps the model's *entire* response —
  // the one case the module doc means by "LLMs sometimes wrap around
  // output". Only fire this whole-text strip when there are exactly the
  // two fence-marker lines that a single wrap would produce; if the model
  // instead fenced each card individually (or a card's own body legitimately
  // contains a fenced example), there are more than two such lines and this
  // step is a no-op — per-chunk stripping below handles those without
  // touching any fence embedded inside a chunk's own content.
  const stripped = countFenceMarkerLines(text) === 2 ? stripOuterCodeFence(text) : text;

  // Try explicit separator first
  let chunks = stripped
    .split("---CARD---")
    .map((s) => s.trim())
    .filter(Boolean);

  // If no separator found, try splitting on YAML frontmatter boundaries
  if (chunks.length <= 1) {
    chunks = stripped
      .split(/\n(?=---\nid:)/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Each chunk may still carry its own individual wrapping fence (e.g. the
  // model fenced each card separately rather than the whole response) —
  // strip that too, per chunk, without touching fences embedded further
  // inside that chunk's own body.
  chunks = chunks.map(stripOuterCodeFence);

  return chunks.filter((chunk) => {
    try {
      parseStoryCard(chunk);
      return true;
    } catch (e) {
      console.error(`Failed to parse generated card: ${e instanceof Error ? e.message : e}`);
      console.error(`Card text: ${chunk.slice(0, 200)}...`);
      return false;
    }
  });
}

// --- Observation promotion ---

export function buildObservationPrompt(result: VerdictResult): string {
  const observationList = result.observations
    .map((o) => `- [${o.kind}] ${o.description}`)
    .join("\n");

  return `You are a QA analyst. Given observations from a test run, generate a focused story card for each observation that needs follow-up.

Each card MUST include:
- A unique id (use the scenario name with a suffix, e.g., ${result.scenario}-obs-1)
- parent: ${result.scenario}
- tags: observation
- A clear title describing the issue or improvement
- A description explaining what was observed
- Acceptance criteria (at least one)

## Scenario: ${result.scenario}

## Observations

${observationList}

Generate one story card per observation. Output each as a complete story card in markdown format with YAML frontmatter, separated by "---CARD---" markers.`;
}

export async function generateFromObservations(
  result: VerdictResult,
  client: LLMClient,
): Promise<string[]> {
  if (result.observations.length === 0) return [];

  const prompt = buildObservationPrompt(result);
  const response = await client.chat(
    [client.userMessage(prompt)],
    [],
    "You are a QA analyst. Output story cards in markdown format.",
  );

  return splitAndValidateCards(response.text);
}

// --- Failure analysis ---

export function buildFailurePrompt(result: VerdictResult): string | null {
  if (result.status !== "fail") return null;

  return `You are a QA analyst. A test scenario has failed. Generate 2-3 follow-up story cards that investigate the root cause and verify the fix.

Each card MUST include:
- A unique id (use the scenario name with a suffix, e.g., ${result.scenario}-fail-1)
- parent: ${result.scenario}
- tags: failure-analysis
- A clear title describing the investigation
- A description explaining what to investigate
- Acceptance criteria (at least one)

## Failed Scenario: ${result.scenario}

**Summary:** ${result.summary}

**Reasoning:** ${result.reasoning}

Generate 2-3 follow-up cards. Output each as a complete story card in markdown format with YAML frontmatter, separated by "---CARD---" markers.`;
}

export async function generateFromFailure(
  result: VerdictResult,
  client: LLMClient,
): Promise<string[]> {
  const prompt = buildFailurePrompt(result);
  if (prompt === null) return [];

  const response = await client.chat(
    [client.userMessage(prompt)],
    [],
    "You are a QA analyst. Output story cards in markdown format.",
  );

  return splitAndValidateCards(response.text);
}
