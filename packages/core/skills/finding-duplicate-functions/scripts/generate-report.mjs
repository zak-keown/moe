import {
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export function countByConfidence(groups) {
	const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
	for (const group of groups) {
		const level = (group.confidence || "").toUpperCase();
		if (level in counts) counts[level]++;
	}
	return counts;
}

export function formatTimestamp() {
	const now = new Date();
	const pad = (n) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function renderFunctions(fns, includeNotes) {
	return fns
		.map((f) => {
			let line = `- \`${f.name}\` in \`${f.file}:${f.line}\``;
			if (includeNotes && f.notes) line += ` - ${f.notes}`;
			return line;
		})
		.join("\n");
}

function renderGroup(group, category, confidence) {
	const lines = [];
	lines.push(`### ${group.intent}`);
	lines.push("");
	lines.push(`**Category:** ${category}`);
	lines.push("");
	lines.push("**Functions:**");
	lines.push(renderFunctions(group.functions, confidence !== "LOW"));
	lines.push("");

	if (confidence === "HIGH") {
		lines.push(
			`**Differences:** ${group.differences || "None - identical implementations"}`,
		);
		lines.push("");
		lines.push(
			`**Recommendation:** Keep \`${group.recommendation?.survivor}\` - ${group.recommendation?.reason}`,
		);
	} else if (confidence === "MEDIUM") {
		lines.push(`**Differences:** ${group.differences}`);
		lines.push("");
		lines.push(
			`**Recommendation:** ${group.recommendation?.action} - ${group.recommendation?.reason}`,
		);
	} else {
		lines.push(`**Notes:** ${group.differences}`);
	}

	lines.push("");
	lines.push("---");
	lines.push("");
	return lines.join("\n");
}

export function generateReport(fileGroups) {
	const allGroups = [];
	for (const { category, groups } of fileGroups) {
		for (const group of groups) {
			allGroups.push({ ...group, _category: category });
		}
	}

	const counts = countByConfidence(allGroups);
	const lines = [];

	lines.push("# Duplicate Functions Report");
	lines.push("");
	lines.push(`Generated: ${formatTimestamp()}`);
	lines.push("");
	lines.push("## Summary");
	lines.push("");
	lines.push("| Confidence | Count | Action |");
	lines.push("|------------|-------|--------|");
	lines.push(`| HIGH | ${counts.HIGH} | Consolidate immediately |`);
	lines.push(`| MEDIUM | ${counts.MEDIUM} | Investigate further |`);
	lines.push(`| LOW | ${counts.LOW} | Review if time permits |`);
	lines.push("");
	lines.push("---");
	lines.push("");
	lines.push("## HIGH Confidence Duplicates");
	lines.push("");
	lines.push(
		"These functions are definitely duplicates. Consolidate them.",
	);
	lines.push("");

	for (const g of allGroups.filter((g) => g.confidence === "HIGH")) {
		lines.push(renderGroup(g, g._category, "HIGH"));
	}

	lines.push("");
	lines.push("## MEDIUM Confidence Duplicates");
	lines.push("");
	lines.push(
		"These functions likely do the same thing. Investigate before consolidating.",
	);
	lines.push("");

	for (const g of allGroups.filter((g) => g.confidence === "MEDIUM")) {
		lines.push(renderGroup(g, g._category, "MEDIUM"));
	}

	lines.push("");
	lines.push("## LOW Confidence (Possibly Related)");
	lines.push("");
	lines.push(
		"These functions might be related. Review if time permits.",
	);
	lines.push("");

	for (const g of allGroups.filter((g) => g.confidence === "LOW")) {
		lines.push(renderGroup(g, g._category, "LOW"));
	}

	return lines.join("\n");
}

function main() {
	const args = process.argv.slice(2);

	if (args.includes("-h") || args.includes("--help")) {
		process.stdout.write(
			[
				"Usage: node generate-report.mjs <duplicates-dir> [output-file]",
				"",
				"Generate markdown report from duplicate detection results.",
				"",
				"ARGUMENTS:",
				"    duplicates-dir    Directory containing per-category duplicate JSON files",
				"    output-file       Output markdown file (default: duplicates-report.md)",
				"",
			].join("\n"),
		);
		process.exit(0);
	}

	if (!args[0]) {
		process.stderr.write("Error: duplicates directory required\n");
		process.exit(1);
	}

	const duplicatesDir = args[0];
	const output = args[1] || "duplicates-report.md";

	try {
		if (!statSync(duplicatesDir).isDirectory()) {
			process.stderr.write(
				`Error: not a directory: ${duplicatesDir}\n`,
			);
			process.exit(1);
		}
	} catch {
		process.stderr.write(
			`Error: directory not found: ${duplicatesDir}\n`,
		);
		process.exit(1);
	}

	const files = readdirSync(duplicatesDir)
		.filter((f) => f.endsWith(".json"))
		.sort();
	const fileGroups = [];

	for (const file of files) {
		const filePath = join(duplicatesDir, file);
		let groups;
		try {
			groups = JSON.parse(readFileSync(filePath, "utf8"));
		} catch (err) {
			process.stderr.write(
				`Error: malformed JSON in ${filePath}: ${err.message}\n`,
			);
			process.exit(1);
		}
		fileGroups.push({ category: basename(file, ".json"), groups });
	}

	const report = generateReport(fileGroups);
	writeFileSync(output, report);

	const counts = countByConfidence(
		fileGroups.flatMap((fg) => fg.groups),
	);
	process.stderr.write(`Report generated: ${output}\n`);
	process.stderr.write(`  HIGH confidence: ${counts.HIGH} groups\n`);
	process.stderr.write(
		`  MEDIUM confidence: ${counts.MEDIUM} groups\n`,
	);
	process.stderr.write(`  LOW confidence: ${counts.LOW} groups\n`);
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
