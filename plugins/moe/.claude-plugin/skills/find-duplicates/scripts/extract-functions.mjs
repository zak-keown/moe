import {
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PATTERNS = [
	/^export (?:async )?function \w+/,
	/^export const \w+ = (?:async )?\(/,
	/^export const \w+ = (?:async )?function/,
	/^export default (?:async )?function/,
	/^  (?:public |private |protected )(?:async |static )*(?:get |set )?\w+\s*\(/,
	/^  (?:async |static )(?:async |static )*(?:get |set )?\w+\s*\(/,
	/^  (?:get |set )\w+\s*\(/,
	/^  constructor\s*\(/,
	/^(?:async )?function \w+\s*\(/,
];

const EXCLUDED_NAMES = new Set([
	"unknown",
	"if",
	"else",
	"for",
	"while",
	"switch",
	"try",
	"catch",
	"return",
	"throw",
	"new",
	"typeof",
	"await",
	"const",
	"let",
	"var",
	"line",
	"item",
	"entry",
	"element",
	"key",
	"value",
	"i",
	"j",
	"k",
]);

const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"coverage",
	".next",
	".nuxt",
	".cache",
	".turbo",
]);

const TEST_DIRS = new Set(["test", "tests", "__tests__"]);

export function parseExtensions(typesGlob) {
	return typesGlob.split(",").map((g) => g.trim().replace(/^\*/, ""));
}

export function walkSourceFiles(dir, extensions, includeTests) {
	const results = [];
	function walk(current) {
		let entries;
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const name = entry.name;
			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(name)) continue;
				if (!includeTests && TEST_DIRS.has(name)) continue;
				walk(join(current, name));
			} else if (entry.isFile()) {
				if (!extensions.some((ext) => name.endsWith(ext))) continue;
				if (!includeTests && /\.(?:test|spec)\./.test(name)) continue;
				results.push(join(current, name));
			}
		}
	}
	walk(resolve(dir));
	return results.sort();
}

export function extractName(line) {
	let m = line.match(/(?:export )?(?:async )?(?:function |const )(\w+)/);
	if (m) return m[1];
	m = line.match(
		/(?:public |private |protected )?(?:async |static )*(?:get |set )?(\w+)\s*\(/,
	);
	if (m) return m[1];
	return "unknown";
}

export function classifyExport(line) {
	if (/^export default/.test(line)) return "default";
	if (/^export /.test(line)) return "named";
	if (/^  /.test(line)) return "method";
	return "internal";
}

export function extractFromFile(filePath, baseDir, contextLines) {
	const content = readFileSync(filePath, "utf8");
	const lines = content.split("\n");
	const relPath = relative(baseDir, filePath);
	const entries = [];

	for (let i = 0; i < lines.length; i++) {
		if (!PATTERNS.some((p) => p.test(lines[i]))) continue;
		const name = extractName(lines[i]);
		if (EXCLUDED_NAMES.has(name)) continue;

		const end = Math.min(i + 1 + contextLines, lines.length);
		const ctx = lines
			.slice(i, end)
			.join("\n")
			.replace(/\n+$/, "");

		entries.push({
			file: relPath,
			name,
			line: i + 1,
			exportType: classifyExport(lines[i]),
			context: ctx,
		});
	}

	return entries;
}

export function buildCatalog(dir, options = {}) {
	const {
		contextLines = 15,
		types = "*.ts,*.tsx,*.js,*.jsx",
		includeTests = false,
	} = options;

	const extensions = parseExtensions(types);
	const files = walkSourceFiles(dir, extensions, includeTests);
	const catalog = [];

	for (const file of files) {
		catalog.push(...extractFromFile(file, dir, contextLines));
	}

	return catalog.sort(
		(a, b) => a.file.localeCompare(b.file) || a.line - b.line,
	);
}

function main() {
	const args = process.argv.slice(2);
	let output = null;
	let contextLines = 15;
	let types = "*.ts,*.tsx,*.js,*.jsx";
	let includeTests = false;
	let srcDir = null;

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "-h":
			case "--help":
				process.stdout.write(
					[
						"Usage: node extract-functions.mjs [OPTIONS] <source-directory>",
						"",
						"Extract function catalog from TypeScript/JavaScript codebase.",
						"",
						"OPTIONS:",
						"    -o, --output FILE    Output file (default: stdout)",
						"    -c, --context N      Lines of implementation to capture (default: 15)",
						'    -t, --types GLOB     File types to scan (default: "*.ts,*.tsx,*.js,*.jsx")',
						"    --include-tests      Include test files (excluded by default)",
						"    -h, --help           Show this help",
						"",
					].join("\n"),
				);
				process.exit(0);
				break;
			case "-o":
			case "--output":
				output = args[++i];
				break;
			case "-c":
			case "--context":
				contextLines = parseInt(args[++i], 10);
				break;
			case "-t":
			case "--types":
				types = args[++i];
				break;
			case "--include-tests":
				includeTests = true;
				break;
			default:
				if (args[i].startsWith("-")) {
					process.stderr.write(`Unknown option: ${args[i]}\n`);
					process.exit(1);
				}
				srcDir = args[i];
		}
	}

	if (!srcDir) {
		process.stderr.write("Error: source directory required\n");
		process.exit(1);
	}

	try {
		if (!statSync(srcDir).isDirectory()) {
			process.stderr.write(`Error: directory not found: ${srcDir}\n`);
			process.exit(1);
		}
	} catch {
		process.stderr.write(`Error: directory not found: ${srcDir}\n`);
		process.exit(1);
	}

	const catalog = buildCatalog(srcDir, { contextLines, types, includeTests });
	const json = `${JSON.stringify(catalog, null, 2)}\n`;

	if (output) {
		writeFileSync(output, json);
		process.stderr.write(
			`Extracted ${catalog.length} function definitions to ${output}\n`,
		);
	} else {
		process.stdout.write(json);
	}
}

function isDirectEntry() {
	try {
		return (
			realpathSync(process.argv[1]) ===
			realpathSync(fileURLToPath(import.meta.url))
		);
	} catch {
		return false;
	}
}

if (isDirectEntry()) {
	main();
}
