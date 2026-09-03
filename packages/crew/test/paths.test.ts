import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { eventsPath, metaPath, shimPath, workerDir } from "../src/core/paths.js";

describe("workerDir", () => {
  // CR-019: the old fixed /tmp/moe-crew-workers default was predictable and
  // shared across every local account on the host, letting a co-resident
  // user pre-plant a directory (or a symlink) at that path ahead of the
  // operator. Now private and per-user.
  it("defaults under XDG_RUNTIME_DIR when it is set", () => {
    const savedDir = process.env.MOE_CREW_WORKER_DIR;
    const savedXdg = process.env.XDG_RUNTIME_DIR;
    delete process.env.MOE_CREW_WORKER_DIR;
    process.env.XDG_RUNTIME_DIR = "/run/user/1000";
    try {
      expect(workerDir()).toBe("/run/user/1000/moe-crew-workers");
    } finally {
      if (savedDir !== undefined) process.env.MOE_CREW_WORKER_DIR = savedDir;
      if (savedXdg !== undefined) process.env.XDG_RUNTIME_DIR = savedXdg;
      else delete process.env.XDG_RUNTIME_DIR;
    }
  });

  it("falls back to ~/.local/state/moe-crew/workers when XDG_RUNTIME_DIR is unset", () => {
    const savedDir = process.env.MOE_CREW_WORKER_DIR;
    const savedXdg = process.env.XDG_RUNTIME_DIR;
    delete process.env.MOE_CREW_WORKER_DIR;
    delete process.env.XDG_RUNTIME_DIR;
    try {
      expect(workerDir()).toBe(join(homedir(), ".local", "state", "moe-crew", "workers"));
    } finally {
      if (savedDir !== undefined) process.env.MOE_CREW_WORKER_DIR = savedDir;
      if (savedXdg !== undefined) process.env.XDG_RUNTIME_DIR = savedXdg;
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
});
