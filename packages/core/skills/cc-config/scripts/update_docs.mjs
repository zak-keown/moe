/**
 * Fetch the latest Claude Code documentation into the skill's references cache.
 * Usage: node scripts/update_docs.mjs
 */
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LLMS_TXT_URL = "https://docs.claude.com/llms.txt";
const CLAUDE_CODE_PATTERN = /https:\/\/docs\.claude\.com\/en\/docs\/claude-code\/[^\s)]+\.md/g;
const MODULE_PATH = fileURLToPath(import.meta.url);
const REFERENCES_DIR = join(dirname(MODULE_PATH), "..", "references");

function fetchUrl(url, redirects = 0) {
  return new Promise((resolveContent, reject) => {
    const parsed = new URL(url);
    const get = parsed.protocol === "http:" ? httpGet : httpsGet;
    const request = get(parsed, { agent: false }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirects >= 10) {
          reject(new Error("Too many redirects"));
          return;
        }
        resolveContent(fetchUrl(new URL(response.headers.location, parsed).href, redirects + 1));
        return;
      }
      response.setEncoding("utf8");
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolveContent(data);
        } else {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        }
      });
    });
    request.on("error", reject);
  });
}

export async function getClaudeCodeUrls(indexUrl = LLMS_TXT_URL) {
  console.log("📥 Fetching llms.txt...");
  const content = await fetchUrl(indexUrl);
  return [...new Set(content.match(CLAUDE_CODE_PATTERN) ?? [])].sort();
}

export async function fetchAndSaveDoc(url, referencesDir = REFERENCES_DIR) {
  let filename;
  try {
    filename = basename(decodeURIComponent(new URL(url).pathname));
  } catch {
    filename = "";
  }
  if (!/^[a-z0-9][a-z0-9._-]*\.md$/i.test(filename)) {
    console.error(`  Refusing suspicious filename from ${url}`);
    return { url, filename, success: false, error: "rejected filename" };
  }
  const filepath = join(referencesDir, filename);
  if (dirname(resolve(filepath)) !== resolve(referencesDir)) {
    console.error(`  Refusing path escape from ${url}`);
    return { url, filename, success: false, error: "rejected path" };
  }
  try {
    console.log(`  Fetching ${filename}...`);
    const content = await fetchUrl(url);
    mkdirSync(referencesDir, { recursive: true });
    writeFileSync(filepath, content, "utf8");
    return { url, filename, success: true };
  } catch (error) {
    console.error(`  ❌ Failed to fetch ${filename}: ${error.message}`);
    return { url, filename, success: false, error: error.message };
  }
}

async function main() {
  console.log("🚀 Claude Code Documentation Updater\n");
  if (!existsSync(REFERENCES_DIR)) mkdirSync(REFERENCES_DIR, { recursive: true });
  const urls = await getClaudeCodeUrls(process.env.MOE_UPDATE_DOCS_INDEX_URL ?? LLMS_TXT_URL);
  console.log(`✅ Found ${urls.length} Claude Code documentation pages\n`);
  console.log("📥 Downloading documentation...");
  const results = [];
  for (const url of urls) {
    results.push(await fetchAndSaveDoc(url));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  const successful = results.filter((result) => result.success).length;
  const failed = results.length - successful;
  console.log("\n✅ Documentation update complete!");
  console.log(`   ${successful} files downloaded successfully`);
  if (failed > 0) console.log(`   ${failed} files failed to download`);
  console.log(`\n📁 Documentation saved to: ${REFERENCES_DIR}`);
}

function isDirectEntry() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(MODULE_PATH);
  } catch {
    return false;
  }
}

if (isDirectEntry()) {
  main().catch((error) => {
    console.error("❌ Error:", error.message);
    process.exit(1);
  });
}
