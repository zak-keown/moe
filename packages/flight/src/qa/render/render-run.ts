import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { staticReportTemplate } from "../../package-root.js";

export interface RenderRunOptions {
  /** Absolute path to the run dir (must contain result.json and run.jsonl). */
  runDir: string;
  /** Absolute path to the static HTML template. */
  templatePath: string;
  /** Override output filename. Defaults to "index.html". */
  outputName?: string | undefined;
}

/**
 * Render a run's HTML report using a caller-supplied template. Reads
 * result.json + run.jsonl from runDir, splices them into the template's
 * <script id="__MOE_FLIGHT_RUN__"> tag, and writes the result to runDir.
 *
 * The renderer is the single source of truth for the data shape the
 * static page reads from window.__MOE_FLIGHT_RUN__.
 */
export async function renderRunFromTemplate(opts: RenderRunOptions): Promise<string> {
  const resultPath = join(opts.runDir, "result.json");
  const jsonlPath = join(opts.runDir, "run.jsonl");

  try {
    await access(resultPath);
  } catch {
    throw new Error(`renderRun: missing result.json at ${resultPath}`);
  }

  const [template, resultText, runJsonl] = await Promise.all([
    readFile(opts.templatePath, "utf-8"),
    readFile(resultPath, "utf-8"),
    readFile(jsonlPath, "utf-8").catch(() => ""),
  ]);

  const payload = { result: JSON.parse(resultText), runJsonl };
  // Escape any </script in the JSON to prevent breaking out of the
  // surrounding <script> tag. JSON.stringify handles other concerns.
  const json = JSON.stringify(payload).replace(/<\/script/gi, "<\\/script");

  // Lookaheads confirm both attributes are present without prescribing order.
  const re =
    /(<script\b(?=[^>]*\btype="application\/json")(?=[^>]*\bid="__MOE_FLIGHT_RUN__")[^>]*>)([\s\S]*?)(<\/script>)/i;
  if (!re.test(template)) {
    throw new Error("renderRun: template is missing the __MOE_FLIGHT_RUN__ script tag");
  }
  const rendered = template.replace(re, (_match, open, _body, close) => `${open}${json}${close}`);

  const outPath = join(opts.runDir, opts.outputName ?? "index.html");
  await writeFile(outPath, rendered);
  return outPath;
}

/**
 * Convenience wrapper: locate the bundled template (shipped at
 * `<packageRoot>/ui/dist-static/static.html`) and render. Throws a clear
 * error if the template is missing — likely means the SPA was not built.
 *
 * The path used to be counted (`join(here, "..", "..", …)` from
 * `src/render/`), which does not survive a compiled layout. See
 * src/package-root.ts.
 */
export async function renderRun(runDir: string, outputName?: string): Promise<string> {
  const templatePath = staticReportTemplate();
  try {
    await access(templatePath);
  } catch {
    throw new Error(
      `renderRun: static template not found at ${templatePath}. ` +
        `Did you run 'pnpm --filter @bubstack/moe-flight-ui build'?`,
    );
  }
  return renderRunFromTemplate({ runDir, templatePath, outputName });
}
