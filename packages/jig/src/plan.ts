import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { today } from "./util.js";

const PLAN_SKELETON = (name: string) => `# ${name} Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use \`sdd\` (recommended) or \`execute-plan\` to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:**

**Architecture:**

**Tech Stack:**

**Spec:**

## Global Constraints

## Open Decisions

## Out of Scope

---

### Task 1:

**Files:**
- Create:

**Interfaces:**
- Consumes: \`None\`
- Produces:

- [ ] **Step 1:**
`;

const SPEC_SKELETON = (name: string) => `# ${name}

**Status:** Design. No implementation yet.

## Problem

## Decision

## Architecture

## What this does not do
`;

export function planInit(name: string, opts: { cwd?: string } = {}): string {
  const root = opts.cwd ?? process.cwd();
  const dir = join(root, "docs", "moe", "plans");
  mkdirSync(dir, { recursive: true });

  const filename = `${today()}-${name}.md`;
  const filepath = join(dir, filename);

  if (existsSync(filepath)) {
    throw new Error(`${filepath} already exists — refusing to overwrite`);
  }

  writeFileSync(filepath, PLAN_SKELETON(name));
  return filepath;
}

export function specInit(name: string, opts: { cwd?: string } = {}): string {
  const root = opts.cwd ?? process.cwd();
  const dir = join(root, "docs", "moe", "specs");
  mkdirSync(dir, { recursive: true });

  const filename = `${today()}-${name}-design.md`;
  const filepath = join(dir, filename);

  if (existsSync(filepath)) {
    throw new Error(`${filepath} already exists — refusing to overwrite`);
  }

  writeFileSync(filepath, SPEC_SKELETON(name));
  return filepath;
}
