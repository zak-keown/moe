import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");
const DESCRIPTION = "Launch, control and monitor Claude Code, Codex, and Pi workers over tmux.";

describe("moe-crew marketplace prose", () => {
  it("keeps the root marketplace and mint source harness-neutral", () => {
    const marketplace = JSON.parse(
      readFileSync(join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"),
    ) as { plugins: Array<{ name: string; description?: string }> };
    const crew = marketplace.plugins.find((plugin) => plugin.name === "moe-crew");
    const mintSource = readFileSync(
      join(ROOT, "packages", "crew", "mint", "moe-crew.yaml"),
      "utf8",
    );

    expect(crew?.description).toBe(DESCRIPTION);
    expect(mintSource).toContain(`description: ${DESCRIPTION}`);
  });
});
