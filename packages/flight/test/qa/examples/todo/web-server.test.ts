import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

// CR-028: the static branch streamed the file with `new Response(body)` and
// no `content-type` header. Under Bun, `Bun.file(path)` supplied the MIME
// type from the extension; the port to `@hono/node-server` dropped it and
// nothing replaced it, so a browser displayed the raw HTML source as text
// instead of rendering the page — the Web adapter's sole Web-tutorial target
// was unusable for that reason, unrelated to any card under test.
//
// examples/todo is a source-only fixture (tsx runs it in place, exactly like
// run-web.sh does), so the server is spawned as a subprocess the same way
// the Web adapter's own launcher does — same pattern as cli.test.ts's
// spawnSync, but long-running so it needs spawn + an explicit kill.
const PKG_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const SERVER = join(PKG_ROOT, "examples", "todo", "web", "server.ts");

let tmp: string | null = null;
let child: ChildProcessWithoutNullStreams | null = null;

afterEach(() => {
  if (child) {
    child.kill("SIGTERM");
    child = null;
  }
  if (tmp) {
    rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  }
});

function startServer(port: number): Promise<void> {
  tmp = mkdtempSync(join(tmpdir(), "todo-web-"));
  const stateFile = join(tmp, "state.json");
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(process.execPath, ["--import", "tsx", SERVER], {
      cwd: PKG_ROOT,
      env: { ...process.env, TODO_STATE_FILE: stateFile, TODO_WEB_PORT: String(port) },
    });
    child = proc;
    let out = "";
    let settled = false;
    const onData = (chunk: Buffer) => {
      out += chunk.toString();
      if (!settled && out.includes("listening on")) {
        settled = true;
        clearTimeout(timeout);
        resolvePromise();
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`todo web server did not report ready in time: ${out}`));
      }
    }, 10_000);
    proc.once("exit", (code) => {
      if (!settled && code !== null && code !== 0) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`todo web server exited early (${code}): ${out}`));
      }
    });
  });
}

describe("CR-028: todo web fixture serves index.html with a real content-type", () => {
  test("GET / responds text/html, not text/plain", async () => {
    const port = 20000 + (process.pid % 10000);
    await startServer(port);
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    // Sanity: the browser gets rendered markup, not the source dumped as text.
    expect(body).toContain("<!doctype html>");
  });

  test("GET /index.html also responds text/html", async () => {
    const port = 20000 + ((process.pid + 1) % 10000);
    await startServer(port);
    const res = await fetch(`http://localhost:${port}/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});
