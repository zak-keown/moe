#!/usr/bin/env node
"use strict";

/**
 * render-html.cjs — thin CJS template renderer for Moe skill reports.
 *
 * Reads the adjacent report-base.html template (or a caller-supplied
 * override), fills its slot markers from a JSON input file, and writes
 * portable HTML. Mermaid rendering uses the template's CDN dependency.
 *
 * Zero npm dependencies — node built-ins only.
 *
 * CLI:
 *   node render-html.cjs --input data.json --output report.html
 *   node render-html.cjs --input data.json --output report.html --template custom.html
 *
 * JSON shape:
 *   { title: string, nav?: string, content: string, scripts?: string }
 */

const fs = require("node:fs");
const path = require("node:path");

// ── Slot replacement ──────────────────────────────────────────────

const SLOTS = /** @type {const} */ (["TITLE", "NAV", "CONTENT", "SCRIPTS"]);
const REQUIRED = new Set(["TITLE", "CONTENT"]);
// NAV, CONTENT and SCRIPTS are documented to carry raw HTML/JS (a report's
// nav is literal `<a href="#...">` markup — see
// skills/improve-codebase-architecture/HTML-REPORT.md's sample data.json)
// and must render unescaped. TITLE is the one slot documented as plain text
// (e.g. a report name derived from a directory or file name) and sits
// inside <title>...</title>, so an unescaped value there could break out of
// the element and inject a live tag.
const ESCAPE_SLOTS = new Set(["TITLE"]);
const SENTINELS = Object.fromEntries(SLOTS.map((slot) => [slot, `<!-- MOE:SLOT:${slot} -->`]));

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Replace parser-safe HTML comment sentinels in the template with values from `data`.
 * Missing optional slots become empty strings. Missing required slots
 * throw.
 *
 * @param {string} template  Raw template HTML.
 * @param {Record<string, string | undefined>} data  Slot values.
 * @returns {string}  Rendered HTML.
 */
function renderTemplate(template, data) {
  let html = template;
  for (const slot of SLOTS) {
    const key = slot.toLowerCase();
    const value = data[key];
    if (value === undefined || value === null) {
      if (REQUIRED.has(slot)) {
        throw new Error(`render-html: required slot "${key}" is missing from input`);
      }
      html = html.replaceAll(SENTINELS[slot], "");
    } else {
      const rendered = ESCAPE_SLOTS.has(slot) ? escapeHtml(String(value)) : String(value);
      html = html.replaceAll(SENTINELS[slot], rendered);
    }
  }
  return html;
}

// ── Arg parsing ───────────────────────────────────────────────────

/**
 * @param {string[]} argv
 * @returns {{ input: string, output: string, template: string }}
 */
function parseArgs(argv) {
  const args = { input: "", output: "", template: "" };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--input":
        args.input = argv[++i] || "";
        break;
      case "--output":
        args.output = argv[++i] || "";
        break;
      case "--template":
        args.template = argv[++i] || "";
        break;
    }
  }
  if (!args.input) throw new Error("render-html: --input is required");
  if (!args.output) throw new Error("render-html: --output is required");

  // Installed helper and default template ship together in skills/_shared/.
  if (!args.template) {
    args.template = path.join(__dirname, "report-base.html");
  }
  return args;
}

// ── Main ──────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.template)) {
    throw new Error(`render-html: template not found at ${args.template}`);
  }
  if (!fs.existsSync(args.input)) {
    throw new Error(`render-html: input file not found at ${args.input}`);
  }

  const template = fs.readFileSync(args.template, "utf-8");
  const data = JSON.parse(fs.readFileSync(args.input, "utf-8"));
  const html = renderTemplate(template, data);

  // Ensure the output directory exists.
  const outDir = path.dirname(args.output);
  if (outDir && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(args.output, html);
}

// Only run main() when invoked directly (not when required for testing).
if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(err.message + "\n");
    process.exit(1);
  }
}

// Export internals for testing.
module.exports = { renderTemplate, parseArgs, SLOTS, SENTINELS };
