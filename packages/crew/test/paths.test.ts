import { describe, expect, it } from "vitest";
import {
  claudeTranscriptPath,
  eventsPath,
  metaPath,
  shimPath,
  workerDir,
} from "../src/core/paths.js";

describe("workerDir", () => {
  it("returns /tmp/moe-crew-workers by default when env var is unset", () => {
    const saved = process.env.MOE_CREW_WORKER_DIR;
    delete process.env.MOE_CREW_WORKER_DIR;
    try {
      expect(workerDir()).toBe("/tmp/moe-crew-workers");
    } finally {
      if (saved !== undefined) process.env.MOE_CREW_WORKER_DIR = saved;
    }
  });

  it("returns the override when MOE_CREW_WORKER_DIR is set", () => {
    const saved = process.env.MOE_CREW_WORKER_DIR;
    process.env.MOE_CREW_WORKER_DIR = "/custom/workers";
    try {
      expect(workerDir()).toBe("/custom/workers");
    } finally {
      if (saved !== undefined) process.env.MOE_CREW_WORKER_DIR = saved;
      else delete process.env.MOE_CREW_WORKER_DIR;
    }
  });
});

describe("path builders", () => {
  it("builds events path", () => {
    expect(eventsPath("/d", "SID")).toBe("/d/SID.events.jsonl");
  });

  it("builds meta path", () => {
    expect(metaPath("/d", "SID")).toBe("/d/SID.meta");
  });

  it("builds shim path", () => {
    expect(shimPath("/d", "my-worker")).toBe("/d/bin/my-worker");
  });

  it("encodes cwd slashes as dashes for the claude transcript path", () => {
    expect(claudeTranscriptPath("/h", "/Users/x/p", "SID")).toBe(
      "/h/.claude/projects/-Users-x-p/SID.jsonl",
    );
  });

  it("encodes a dot in the cwd as a dash (real claude dir encoding)", () => {
    expect(claudeTranscriptPath("/h", "/Users/x/.claude", "SID")).toBe(
      "/h/.claude/projects/-Users-x--claude/SID.jsonl",
    );
  });

  it("encodes an underscore in the cwd as a dash", () => {
    expect(claudeTranscriptPath("/h", "/a/my_proj", "SID")).toBe(
      "/h/.claude/projects/-a-my-proj/SID.jsonl",
    );
  });

  it("encodes a /.worktrees segment as a double-dash", () => {
    expect(claudeTranscriptPath("/h", "/u/lace/.worktrees/x", "SID")).toBe(
      "/h/.claude/projects/-u-lace--worktrees-x/SID.jsonl",
    );
  });

  it("encodes a colon in the cwd as a dash (real claude dir encoding)", () => {
    expect(claudeTranscriptPath("/h", "/a/c:d", "SID")).toBe(
      "/h/.claude/projects/-a-c-d/SID.jsonl",
    );
  });
});
