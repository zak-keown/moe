/** Render Graphviz diagrams from a skill's SKILL.md to SVG files. */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MODULE_PATH = fileURLToPath(import.meta.url);

export function extractDotBlocks(markdown) {
  const blocks = [];
  const regex = /```dot\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const content = match[1].trim();
    const nameMatch = content.match(/digraph\s+(\w+)/);
    blocks.push({ name: nameMatch ? nameMatch[1] : `graph_${blocks.length + 1}`, content });
  }
  return blocks;
}

export function extractGraphBody(dotContent) {
  const match = dotContent.match(/digraph\s+\w+\s*\{([\s\S]*)\}/);
  if (!match) return "";
  return match[1].replace(/^\s*rankdir\s*=\s*\w+\s*;?\s*$/gm, "").trim();
}

export function combineGraphs(blocks, skillName) {
  const bodies = blocks.map((block, index) => {
    const body = extractGraphBody(block.content);
    return `  subgraph cluster_${index} {
    label="${block.name}";
    ${body.split("\n").map((line) => `  ${line}`).join("\n")}
  }`;
  });
  return `digraph ${skillName}_combined {
  rankdir=TB;
  compound=true;
  newrank=true;

${bodies.join("\n\n")}
}`;
}

function runDot(args, input, options = {}) {
  return spawnSync("dot", args, { ...options, input, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

export function renderToSvg(dotContent) {
  const result = runDot(["-Tsvg"], dotContent);
  if (result.error || result.status !== 0) {
    console.error("Error running dot:", result.error?.message ?? `exited ${result.status}`);
    if (result.stderr) console.error(result.stderr);
    return null;
  }
  return result.stdout;
}

export function main(args = process.argv.slice(2)) {
  const combine = args.includes("--combine");
  const skillDirArg = args.find((arg) => !arg.startsWith("--"));
  if (!skillDirArg) {
    console.error("Usage: render-graphs.mjs <skill-directory> [--combine]");
    console.error("\nOptions:\n  --combine    Combine all diagrams into one SVG");
    console.error("\nExample:\n  node render-graphs.mjs ../subagent-driven-development");
    console.error("  node render-graphs.mjs ../subagent-driven-development --combine");
    return 1;
  }
  const skillDir = resolve(skillDirArg);
  const skillFile = join(skillDir, "SKILL.md");
  const skillName = basename(skillDir).replace(/[^\w]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (!existsSync(skillFile)) {
    console.error(`Error: ${skillFile} not found`);
    return 1;
  }
  const probe = runDot(["-V"], undefined, { stdio: "ignore" });
  if (probe.error || probe.status !== 0) {
    console.error("Error: graphviz (dot) not found. Install with:");
    console.error("  brew install graphviz    # macOS");
    console.error("  apt install graphviz     # Linux");
    return 1;
  }
  const blocks = extractDotBlocks(readFileSync(skillFile, "utf8"));
  if (blocks.length === 0) {
    console.log("No ```dot blocks found in", skillFile);
    return 0;
  }
  console.log(`Found ${blocks.length} diagram(s) in ${basename(skillDir)}/SKILL.md`);
  const outputDir = join(skillDir, "diagrams");
  if (!existsSync(outputDir)) mkdirSync(outputDir);
  if (combine) {
    const combined = combineGraphs(blocks, skillName);
    const svg = renderToSvg(combined);
    if (svg) {
      writeFileSync(join(outputDir, `${skillName}_combined.svg`), svg);
      console.log(`  Rendered: ${skillName}_combined.svg`);
      writeFileSync(join(outputDir, `${skillName}_combined.dot`), combined);
      console.log(`  Source: ${skillName}_combined.dot`);
    } else {
      console.error("  Failed to render combined diagram");
    }
  } else {
    for (const block of blocks) {
      const svg = renderToSvg(block.content);
      if (svg) {
        writeFileSync(join(outputDir, `${block.name}.svg`), svg);
        console.log(`  Rendered: ${block.name}.svg`);
      } else console.error(`  Failed: ${block.name}`);
    }
  }
  console.log(`\nOutput: ${outputDir}/`);
  return 0;
}

function isDirectEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(MODULE_PATH);
  } catch {
    return false;
  }
}

if (isDirectEntry()) process.exitCode = main();
