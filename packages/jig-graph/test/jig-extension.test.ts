import type { JigContext } from "@bubstack/moe-jig/extension";
import { describe, expect, it, vi } from "vitest";

const isAvailableMock = vi.fn().mockResolvedValue(true);
const disconnectMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/moedex.js", () => ({
  MoedexClient: vi.fn().mockImplementation(() => ({
    isAvailable: isAvailableMock,
    disconnect: disconnectMock,
  })),
}));

const seedPlanSkeletonMock = vi.fn().mockResolvedValue("### Task 1: [TODO: name]\n");
vi.mock("../src/seed.js", () => ({
  seedPlanSkeleton: seedPlanSkeletonMock,
}));

const { commands } = await import("../src/jig-extension.js");
const seed = commands.find((c) => c.name === "seed")!;
const fakeCtx = {} as JigContext;

describe("plan seed topic parsing", () => {
  it("keeps a topic word that coincides with the --entry value (CR-054)", async () => {
    seedPlanSkeletonMock.mockClear();

    // --entry consumes exactly one value (the token right after it); every
    // other "foo.ts" in args is free-text the user typed as part of the
    // topic and must survive, even though it happens to equal the entry
    // value.
    await seed.run(["--entry", "foo.ts", "describe", "foo.ts", "usage"], fakeCtx);

    expect(seedPlanSkeletonMock).toHaveBeenCalledWith("describe foo.ts usage", expect.anything(), {
      entry: "foo.ts",
    });
  });

  it("still consumes only the --entry flag and its value when no word repeats", async () => {
    seedPlanSkeletonMock.mockClear();

    await seed.run(["--entry", "index.ts", "refactor", "the", "loader"], fakeCtx);

    expect(seedPlanSkeletonMock).toHaveBeenCalledWith("refactor the loader", expect.anything(), {
      entry: "index.ts",
    });
  });
});
