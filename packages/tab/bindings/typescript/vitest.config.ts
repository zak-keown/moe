import { defineConfig } from "vitest/config";

// Two projects, because this package is a binding over a Rust cdylib. The `ffi`
// suite dlopens `target/{release,debug}/libmoe_tab_ffi.*`, which only exists after
// `pnpm tab:build` (or `cargo build -p moe-tab-ffi`) — and the CI image that runs
// `pnpm test` is node:24, with no cargo in it. `pnpm test` is therefore the
// toolchain-free set; `pnpm test:ffi` is opt-in and needs the cdylib built.
//
// Upstream ran the FFI suite as the only suite, under `node --test`, from a CI job
// that had already built the dylib. Splitting keeps that coverage reachable without
// letting the default suite claim it verified the seam.
export default defineConfig({
  test: {
    // The FFI suites mutate the process-global MOE_TAB_PRICING_DIR that the
    // dlopen'd core reads back through getenv, so they must not run in parallel
    // workers. Upstream's answer to the same hazard on the Rust side is
    // `cargo test -- --test-threads=1`.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "ffi",
          include: ["test/ffi/**/*.test.ts"],
        },
      },
    ],
  },
});
