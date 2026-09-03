import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function splitLines(text) {
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export function parseScenarioToStories(content) {
  const storyToScenarios = new Map();
  let currentId;
  for (const line of splitLines(content)) {
    const idMatch = line.match(/^## (SCENARIO-\d+|JOURNEY-\d+)/);
    if (idMatch) currentId = idMatch[1];
    if (currentId && line.startsWith("**Owning stories:**")) {
      const refsText = line.split(":**", 2)[1].trim();
      for (const storyId of refsText.match(/STORY-\d+/g) ?? []) {
        const scenarioIds = storyToScenarios.get(storyId) ?? [];
        scenarioIds.push(currentId);
        storyToScenarios.set(storyId, scenarioIds);
      }
    }
  }
  return storyToScenarios;
}

export function backlinkEpicContent(content, storyToScenarios) {
  const lines = splitLines(content);
  let updated = 0;
  let skipped = 0;
  let currentStoryId;
  const newLines = [];
  for (let line of lines) {
    const storyMatch = line.match(/^## (STORY-\d+)/);
    if (storyMatch) currentStoryId = storyMatch[1];
    if (
      currentStoryId &&
      storyToScenarios.has(currentStoryId) &&
      /^- AC-\d+:/.test(line)
    ) {
      if (line.toLowerCase().includes("scenario:")) skipped += 1;
      else if (!line.includes("impact:`none`")) {
        line = `${line} · scenario:\`${storyToScenarios.get(currentStoryId)[0]}\``;
        updated += 1;
      }
    }
    newLines.push(line);
  }
  return { content: newLines.join("\n"), updated, skipped };
}

export function backlinkEpicFile(epicPath, storyToScenarios) {
  const result = backlinkEpicContent(readFileSync(epicPath, "utf8"), storyToScenarios);
  if (result.updated > 0) writeFileSync(epicPath, result.content);
  return result;
}

export async function main(args) {
  const program = basename(process.argv[1] ?? "backlink_scenarios.mjs");
  if (args.length !== 2) {
    process.stderr.write(`usage: ${program} <scenarios-file> <requirements-dir>\n`);
    return 2;
  }
  const [scenariosPath, requirementsDirectory] = args;
  if (!existsSync(scenariosPath)) {
    process.stderr.write(`error: file not found: ${scenariosPath}\n`);
    return 2;
  }
  if (!existsSync(requirementsDirectory) || !statSync(requirementsDirectory).isDirectory()) {
    process.stderr.write(`error: directory not found: ${requirementsDirectory}\n`);
    return 2;
  }

  const storyToScenarios = parseScenarioToStories(readFileSync(scenariosPath, "utf8"));
  if (storyToScenarios.size === 0) {
    process.stderr.write("warning: no scenario-to-story mappings found\n");
    return 0;
  }

  let totalUpdated = 0;
  let totalSkipped = 0;
  const epicFiles = readdirSync(requirementsDirectory)
    .filter((name) => /^EPIC-.*\.md$/.test(name))
    .sort();
  for (const name of epicFiles) {
    const result = backlinkEpicFile(join(requirementsDirectory, name), storyToScenarios);
    if (result.updated > 0) process.stdout.write(`${name}: ${result.updated} AC(s) linked\n`);
    totalUpdated += result.updated;
    totalSkipped += result.skipped;
  }
  process.stdout.write(`OK: ${totalUpdated} AC(s) linked, ${totalSkipped} already linked\n`);
  return 0;
}

const isDirect = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirect) process.exitCode = await main(process.argv.slice(2));
