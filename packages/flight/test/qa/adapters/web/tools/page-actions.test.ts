import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { executeFileUpload } from "../../../../../src/qa/adapters/web/tools/page-actions.js";
import type { WebToolCtx } from "../../../../../src/qa/adapters/web/tools/types.js";

// CR-032: file_upload handed args.file_paths straight to
// DOM.setFileInputFiles with no containment — unlike install_cookies /
// install_passkey, which route their path through resolveInside(contextRoot,
// path). A model could attach ~/.ssh/id_rsa or the run's own evidence
// directory to a file input on the target site, and the browser would
// upload the bytes to whatever origin the page posts to.
describe("CR-032: file_upload containment", () => {
  let contextRoot: string;
  let fileUpload: ReturnType<typeof vi.fn>;

  function makeCtx(root: string | null): WebToolCtx {
    fileUpload = vi.fn(async (_tab: unknown, _selector: string, paths: string[]) => ({
      uploaded: true,
      files: paths.length,
    }));
    return {
      chrome: { fileUpload } as unknown as WebToolCtx["chrome"],
      tab: 0,
      logger: {} as WebToolCtx["logger"],
      takeReturnScreenshot: async () => ({ screenshotSkipped: "no chrome in this test" }),
      contextRoot: root,
    };
  }

  beforeEach(() => {
    contextRoot = mkdtempSync(join(tmpdir(), "file-upload-ctx-"));
  });

  afterEach(() => {
    rmSync(contextRoot, { recursive: true, force: true });
  });

  test("rejects an absolute path instead of forwarding it to setFileInputFiles", async () => {
    const ctx = makeCtx(contextRoot);
    const result = await executeFileUpload(ctx, {
      selector: "#f",
      file_paths: ["/etc/passwd"],
    });
    expect(fileUpload).not.toHaveBeenCalled();
    expect(result.text).toMatch(/must be relative to the context root/i);
  });

  test("rejects a traversal path", async () => {
    const ctx = makeCtx(contextRoot);
    const result = await executeFileUpload(ctx, {
      selector: "#f",
      file_paths: ["../../etc/passwd"],
    });
    expect(fileUpload).not.toHaveBeenCalled();
    expect(result.text).toMatch(/must not contain "\.\." segments/i);
  });

  test("rejects every call when no context root is configured", async () => {
    const ctx = makeCtx(null);
    const result = await executeFileUpload(ctx, {
      selector: "#f",
      file_paths: ["resume.pdf"],
    });
    expect(fileUpload).not.toHaveBeenCalled();
    expect(result.text).toMatch(/requires a context directory/i);
  });

  test("resolves a legitimate relative path under the context root and forwards the resolved absolute path", async () => {
    const ctx = makeCtx(contextRoot);
    const result = await executeFileUpload(ctx, {
      selector: "#f",
      file_paths: ["alice/resume.pdf"],
    });
    expect(fileUpload).toHaveBeenCalledTimes(1);
    const forwarded = fileUpload.mock.calls[0]?.[2] as string[];
    expect(forwarded).toEqual([join(contextRoot, "alice", "resume.pdf")]);
    expect(result.text).toContain("uploaded 1 file(s)");
  });
});
