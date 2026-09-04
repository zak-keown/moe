import { existsSync, readdirSync, realpathSync, } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

export function findTestFiles(baseDir, pattern) {
	const parts = pattern.split("/");
	return collectFiles(baseDir, parts, 0).sort();
}

function collectFiles(dir, parts, depth) {
	if (depth >= parts.length) return [];
	const segment = parts[depth];
	const isLast = depth === parts.length - 1;

	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	const results = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (segment === "**") {
			if (isLast) continue;
			results.push(...collectFiles(dir, parts, depth + 1));
			if (entry.isDirectory()) {
				results.push(...collectFiles(full, parts, depth));
			}
		} else if (matchGlob(entry.name, segment)) {
			if (isLast) {
				if (!entry.isDirectory()) results.push(full);
			} else if (entry.isDirectory()) {
				results.push(...collectFiles(full, parts, depth + 1));
			}
		}
	}
	return results;
}

function matchGlob(name, pattern) {
	const re = new RegExp(
		`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`,
	);
	return re.test(name);
}

export function runPollutionSearch(pollutionCheck, testPattern, cwd) {
	const files = findTestFiles(cwd, testPattern);
	const total = files.length;
	const output = [];

	output.push(`Found ${total} test files\n`);

	let count = 0;
	for (const testFile of files) {
		count++;
		const rel = relative(cwd, testFile);
		const checkPath = join(cwd, pollutionCheck);

		if (existsSync(checkPath)) {
			output.push(
				`Pollution already exists before test ${count}/${total}`,
			);
			output.push(`   Skipping: ${rel}`);
			continue;
		}

		output.push(`[${count}/${total}] Testing: ${rel}`);

		spawnSync("npm", ["test", rel], {
			cwd,
			stdio: "ignore",
		});

		if (existsSync(checkPath)) {
			output.push("");
			output.push("FOUND POLLUTER!");
			output.push(`   Test: ${rel}`);
			output.push(`   Created: ${pollutionCheck}`);
			return { found: true, test: rel, output: output.join("\n") };
		}
	}

	output.push("");
	output.push("No polluter found - all tests clean!");
	return { found: false, output: output.join("\n") };
}

function isDirectEntry() {
	try {
		const thisFile = new URL(import.meta.url).pathname;
		const realArgv = realpathSync(process.argv[1] ?? "");
		const realThis = realpathSync(thisFile);
		return realArgv === realThis;
	} catch {
		return false;
	}
}

if (isDirectEntry()) {
	const args = process.argv.slice(2);
	if (args.length !== 2) {
		process.stderr.write(
			"usage: node find-polluter.mjs <file_or_dir_to_check> <test_pattern>\n",
		);
		process.exit(2);
	}

	const [pollutionCheck, testPattern] = args;
	const result = runPollutionSearch(pollutionCheck, testPattern, process.cwd());
	process.stdout.write(`${result.output}\n`);
	process.exit(result.found ? 1 : 0);
}
