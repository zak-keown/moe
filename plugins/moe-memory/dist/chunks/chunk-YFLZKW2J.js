// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);

// src/paths.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var JOURNAL_DIR_NAME = ".moe-journal";
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
function getClaudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
}
function getCodexDir() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}
function getConversationSourceDirs() {
  const testDir = process.env.TEST_PROJECTS_DIR;
  if (testDir) return [testDir];
  const claudeDir = getClaudeDir();
  const codexDir = getCodexDir();
  return [
    path.join(claudeDir, "projects"),
    path.join(claudeDir, "transcripts"),
    path.join(codexDir, "sessions")
  ].filter((d) => fs.existsSync(d));
}
function findJsonlFiles(dir, excludedDirNames) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(entry.name);
      } else if (entry.isDirectory()) {
        if (excludedDirNames?.has(entry.name)) continue;
        const subDir = path.join(dir, entry.name);
        for (const f of findJsonlFiles(subDir, excludedDirNames)) {
          results.push(path.join(entry.name, f));
        }
      }
    }
  } catch {
  }
  return results;
}
function getMemoryDataDir() {
  let dir;
  if (process.env.MOE_MEMORY_CONFIG_DIR) {
    dir = process.env.MOE_MEMORY_CONFIG_DIR;
  } else if (process.env.MOE_DATA_DIR) {
    dir = path.join(process.env.MOE_DATA_DIR, "memory");
  } else {
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;
    if (xdgConfigHome) {
      dir = path.join(xdgConfigHome, "moe", "memory");
    } else {
      dir = path.join(os.homedir(), ".config", "moe", "memory");
    }
  }
  return ensureDir(dir);
}
function getArchiveDir() {
  if (process.env.TEST_ARCHIVE_DIR) {
    return ensureDir(process.env.TEST_ARCHIVE_DIR);
  }
  return ensureDir(path.join(getMemoryDataDir(), "conversation-archive"));
}
function getIndexDir() {
  return ensureDir(path.join(getMemoryDataDir(), "conversation-index"));
}
function getModelCacheDir() {
  if (process.env.MOE_MEMORY_MODEL_CACHE_DIR) {
    return ensureDir(process.env.MOE_MEMORY_MODEL_CACHE_DIR);
  }
  return ensureDir(path.join(getMemoryDataDir(), "models"));
}
function getDbPath() {
  const override = process.env.MOE_MEMORY_DB_PATH || process.env.TEST_DB_PATH;
  if (override) return override;
  return path.join(getIndexDir(), "db.sqlite");
}
function getExcludeConfigPath() {
  return path.join(getIndexDir(), "exclude.txt");
}
function getExcludedProjects() {
  if (process.env.CONVERSATION_SEARCH_EXCLUDE_PROJECTS) {
    return process.env.CONVERSATION_SEARCH_EXCLUDE_PROJECTS.split(",").map((p) => p.trim());
  }
  const configPath = getExcludeConfigPath();
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, "utf-8");
    return content.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  }
  return [];
}
function journalPathOverride() {
  return process.env.MOE_MEMORY_JOURNAL_PATH;
}
function resolveJournalPath(subdirectory = JOURNAL_DIR_NAME, includeCurrentDirectory = true) {
  const override = journalPathOverride();
  if (override) return override;
  const possiblePaths = [];
  if (includeCurrentDirectory) {
    try {
      const cwd = process.cwd();
      if (cwd !== "/" && cwd !== "C:\\" && cwd !== "/System" && cwd !== "/usr") {
        possiblePaths.push(path.join(cwd, subdirectory));
      }
    } catch {
    }
  }
  if (process.env.HOME) {
    possiblePaths.push(path.join(process.env.HOME, subdirectory));
  }
  if (process.env.USERPROFILE) {
    possiblePaths.push(path.join(process.env.USERPROFILE, subdirectory));
  }
  possiblePaths.push(path.join("/tmp", subdirectory));
  if (process.env.TEMP) {
    possiblePaths.push(path.join(process.env.TEMP, subdirectory));
  }
  if (process.env.TMP) {
    possiblePaths.push(path.join(process.env.TMP, subdirectory));
  }
  return possiblePaths[0] ?? path.join("/tmp", subdirectory);
}
function resolveProjectJournalPath() {
  return resolveJournalPath(JOURNAL_DIR_NAME, true);
}
function resolveUserJournalPath() {
  const override = journalPathOverride();
  if (override) return override;
  return path.join(getMemoryDataDir(), "journal");
}
function journalRoots() {
  const roots = [path.resolve(resolveProjectJournalPath()), path.resolve(resolveUserJournalPath())];
  return [...new Set(roots)];
}

export {
  JOURNAL_DIR_NAME,
  getClaudeDir,
  getCodexDir,
  getConversationSourceDirs,
  findJsonlFiles,
  getMemoryDataDir,
  getArchiveDir,
  getIndexDir,
  getModelCacheDir,
  getDbPath,
  getExcludeConfigPath,
  getExcludedProjects,
  resolveJournalPath,
  resolveProjectJournalPath,
  resolveUserJournalPath,
  journalRoots
};
