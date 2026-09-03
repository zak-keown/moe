import fs from "node:fs";
import path from "node:path";
import { getMemoryDataDir } from "./paths.js";
export function getLogDir() {
    const dir = path.join(getMemoryDataDir(), "logs");
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
export function getSyncLogPath() {
    return path.join(getLogDir(), "moe-memory.log");
}
export function formatLogLine(level, message) {
    return `${new Date().toISOString()} [${level}] ${message}\n`;
}
export function appendLogLine(level, message) {
    fs.appendFileSync(getSyncLogPath(), formatLogLine(level, message), "utf-8");
}
