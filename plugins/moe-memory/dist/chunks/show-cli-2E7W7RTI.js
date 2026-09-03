// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  formatConversationAsHTML,
  formatConversationAsMarkdown
} from "./chunk-BCQKWEPH.js";
import "./chunk-XRZM5UX2.js";

// src/show-cli.ts
import { readFileSync } from "node:fs";
var HELP = `
Usage: moe-memory show [OPTIONS] <file>

Display a conversation from a JSONL file in a human-readable format.

OPTIONS:
  --format, -f FORMAT    Output format: markdown or html (default: markdown)
  --help, -h             Show this help

EXAMPLES:
  # Show conversation as markdown
  moe-memory show conversation.jsonl

  # Generate HTML for browser viewing
  moe-memory show --format html conversation.jsonl > output.html

  # View with pipe
  moe-memory show conversation.jsonl | less
`;
function runShow(args) {
  let format = "markdown";
  let filePath = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--format" || arg === "-f") {
      const value = args[++i];
      if (value !== "markdown" && value !== "html") {
        console.error(
          `Invalid --format value: ${value ?? "(missing)"}. Expected markdown or html.`
        );
        return 1;
      }
      format = value;
    } else if (arg === "--help" || arg === "-h") {
      console.log(HELP);
      return 0;
    } else if (!filePath && arg !== void 0) {
      filePath = arg;
    }
  }
  if (!filePath) {
    console.error("Error: No file specified");
    console.error("Usage: moe-memory show [OPTIONS] <file>");
    console.error("Try: moe-memory show --help");
    return 1;
  }
  try {
    const jsonl = readFileSync(filePath, "utf-8");
    console.log(
      format === "html" ? formatConversationAsHTML(jsonl) : formatConversationAsMarkdown(jsonl)
    );
    return 0;
  } catch (error) {
    console.error(`Error reading file: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
export {
  runShow
};
