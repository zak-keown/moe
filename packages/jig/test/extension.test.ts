import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import type { JigContext, JigExtensionCommand } from "../src/extension.js";
import { loadExtensions } from "../src/extension.js";

describe("loadExtensions", () => {
  it("merges extension commands into an existing command group", () => {
    const program = new Command();
    const plan = program.command("plan").description("test plan group");
    plan
      .command("init")
      .description("existing init")
      .action(() => {});

    const ctx: JigContext = {
      parsePlan: vi.fn(),
      validatePlan: vi.fn(),
      computeWaves: vi.fn(),
    };

    const mockExtension: JigExtensionCommand[] = [
      {
        namespace: "plan",
        name: "validate",
        description: "Validate a plan against the code graph",
        options: [
          { flags: "--json", description: "JSON output" },
          { flags: "--manifest <path>", description: "Validate all plans in manifest" },
        ],
        run: vi.fn().mockResolvedValue(0),
      },
    ];

    // Mock require.resolve to find our fake extension
    loadExtensions(program, ctx, () => mockExtension);

    const planCmd = program.commands.find((c) => c.name() === "plan")!;
    const validateCmd = planCmd.commands.find((c) => c.name() === "validate");
    expect(validateCmd).toBeDefined();
    expect(validateCmd!.description()).toBe("Validate a plan against the code graph");
  });

  it("silently skips when no extension is found", () => {
    const program = new Command();
    program.command("plan").description("test");
    const ctx: JigContext = {
      parsePlan: vi.fn(),
      validatePlan: vi.fn(),
      computeWaves: vi.fn(),
    };

    // Resolver throws — extension not installed
    expect(() =>
      loadExtensions(program, ctx, () => {
        throw new Error("MODULE_NOT_FOUND");
      }),
    ).not.toThrow();
  });

  it("errors on collision with built-in command", () => {
    const program = new Command();
    const plan = program.command("plan").description("test");
    plan
      .command("init")
      .description("built-in")
      .action(() => {});

    const ctx: JigContext = {
      parsePlan: vi.fn(),
      validatePlan: vi.fn(),
      computeWaves: vi.fn(),
    };

    const collision: JigExtensionCommand[] = [
      {
        namespace: "plan",
        name: "init",
        description: "collides with built-in",
        run: vi.fn().mockResolvedValue(0),
      },
    ];

    expect(() => loadExtensions(program, ctx, () => collision)).toThrow(/collision/i);
  });
});
