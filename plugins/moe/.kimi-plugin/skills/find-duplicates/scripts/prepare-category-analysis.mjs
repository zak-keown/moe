import {
	mkdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function sanitizeFilename(name) {
	const safe = name
		.replace(/[^\w-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return safe || null;
}

export function splitCategories(entries, minCount = 3) {
	const groups = new Map();
	for (const entry of entries) {
		const cat = entry.category;
		if (!groups.has(cat)) groups.set(cat, []);
		groups.get(cat).push(entry);
	}
	const written = [];
	const skipped = [];
	const sorted = [...groups.entries()].sort(
		(a, b) => b[1].length - a[1].length,
	);
	for (const [category, fns] of sorted) {
		if (fns.length >= minCount) {
			written.push({ category, count: fns.length, functions: fns });
		} else {
			skipped.push({ category, count: fns.length });
		}
	}
	return { written, skipped };
}

function main() {
	const args = process.argv.slice(2);

	if (args.includes("-h") || args.includes("--help")) {
		process.stdout.write(
			[
				"Usage: node prepare-category-analysis.mjs <categorized.json> [output-dir]",
				"",
				"Split categorized function catalog into per-category files for duplicate analysis.",
				"",
				"ARGUMENTS:",
				"    categorized.json    Output from categorization phase",
				"    output-dir          Directory for category files (default: ./categories)",
				"",
				"OUTPUT:",
				"    Creates one JSON file per category with 3+ functions",
				"",
			].join("\n"),
		);
		process.exit(0);
	}

	if (!args[0]) {
		process.stderr.write("Error: categorized.json required\n");
		process.exit(1);
	}

	const inputFile = args[0];
	const outputDir = args[1] || "./categories";

	let data;
	try {
		data = JSON.parse(readFileSync(inputFile, "utf8"));
	} catch (err) {
		if (err.code === "ENOENT") {
			process.stderr.write(`Error: file not found: ${inputFile}\n`);
		} else {
			process.stderr.write(
				`Error: malformed JSON in ${inputFile}: ${err.message}\n`,
			);
		}
		process.exit(1);
	}

	mkdirSync(outputDir, { recursive: true });
	const resolvedOut = resolve(outputDir);

	process.stderr.write("Analyzing categories...\n");
	const { written, skipped } = splitCategories(data);

	for (const { category, count, functions } of written) {
		const safeName = sanitizeFilename(category);
		if (!safeName) {
			process.stderr.write(
				`  ${category}: ${count} functions (rejected, unsafe name)\n`,
			);
			continue;
		}
		const outPath = join(outputDir, `${safeName}.json`);
		const resolvedPath = resolve(outPath);
		if (
			!resolvedPath.startsWith(resolvedOut + sep) &&
			resolvedPath !== resolvedOut
		) {
			process.stderr.write(
				`  ${category}: ${count} functions (rejected, path traversal)\n`,
			);
			continue;
		}
		writeFileSync(outPath, `${JSON.stringify(functions, null, 2)}\n`);
		process.stderr.write(`  ${category}: ${count} functions -> ${outPath}\n`);
	}

	for (const { category, count } of skipped) {
		process.stderr.write(
			`  ${category}: ${count} functions (skipped, < 3)\n`,
		);
	}

	process.stderr.write(`\nCategory files created in ${outputDir}\n`);
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
