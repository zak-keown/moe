import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(PACKAGE_ROOT, "..", "..");
const WORKFLOW_PATH = join(
	REPO_ROOT,
	".github/workflows/memory-host-qualification.yml",
);
const ORCHESTRATOR_PATH = join(
	PACKAGE_ROOT,
	"test/manual/host-qualification.js",
);

function readHostQualificationWorkflow(): string {
	return readFileSync(WORKFLOW_PATH, "utf-8");
}

function readOrchestrator(): string {
	return readFileSync(ORCHESTRATOR_PATH, "utf-8");
}

describe("host qualification contract", () => {
	it("workflow exists", () => {
		expect(existsSync(WORKFLOW_PATH)).toBe(true);
	});

	it("orchestrator exists", () => {
		expect(existsSync(ORCHESTRATOR_PATH)).toBe(true);
	});

	it("installs only the uploaded candidate tarball", () => {
		const workflow = readHostQualificationWorkflow();
		expect(workflow).toContain("candidate_tarball");
		const nonCommentLines = workflow
			.split("\n")
			.filter((l) => !l.trimStart().startsWith("#"));
		const runContent = nonCommentLines.join("\n");
		expect(runContent).not.toMatch(/npm publish.*packages\/memory/);
		expect(runContent).not.toContain("pnpm link");
	});

	it("never uses workspace source for installation", () => {
		const workflow = readHostQualificationWorkflow();
		const runBlocks = workflow.split(/^\s*- run:/m).slice(1);
		for (const block of runBlocks) {
			const line = block.split("\n")[0]!.trim();
			expect(line).not.toMatch(/npm publish.*packages\/memory/);
			expect(line).not.toMatch(/pnpm publish.*packages\/memory/);
		}
		expect(workflow).not.toContain("npm link @bubstack/moe-memory");
	});

	it("requires source SHA input", () => {
		const workflow = readHostQualificationWorkflow();
		expect(workflow).toContain("source_sha");
	});

	it("requires candidate integrity input", () => {
		const workflow = readHostQualificationWorkflow();
		expect(workflow).toContain("candidate_integrity");
	});

	it("uses isolated config roots for each host", () => {
		const orchestrator = readOrchestrator();
		expect(orchestrator).toContain("mkdtempSync");
		expect(orchestrator).not.toContain("os.homedir()/.claude");
	});

	it("uses protected claude-maintenance environment", () => {
		const workflow = readHostQualificationWorkflow();
		expect(workflow).toContain("environment: claude-maintenance");
	});

	it("workflow downloads the candidate tarball before qualification", () => {
		const workflow = readHostQualificationWorkflow();
		const downloadIndex = workflow.indexOf("download candidate tarball");
		const qualificationIndex = workflow.indexOf("run host qualification");
		expect(downloadIndex).toBeGreaterThan(-1);
		expect(qualificationIndex).toBeGreaterThan(-1);
		expect(downloadIndex).toBeLessThan(qualificationIndex);
	});

	it("orchestrator supports all eight targets", () => {
		const orchestrator = readOrchestrator();
		for (const host of [
			"claude-code",
			"codex",
			"copilot",
			"cursor",
			"kimi",
			"opencode",
			"pi",
			"agent-plugins-1.0",
		]) {
			expect(orchestrator).toContain(host);
		}
	});

	it("orchestrator computes tarball integrity from candidate file", () => {
		const orchestrator = readOrchestrator();
		expect(orchestrator).toContain("computeTarballIntegrity");
		expect(orchestrator).toContain("sha512");
	});

	it("orchestrator writes checksummed evidence report", () => {
		const orchestrator = readOrchestrator();
		expect(orchestrator).toContain("evidence");
		expect(orchestrator).toContain("sha256");
		expect(orchestrator).toContain("result_id");
	});

	it("orchestrator binds evidence to producer identity", () => {
		const orchestrator = readOrchestrator();
		expect(orchestrator).toContain("producer-repository");
		expect(orchestrator).toContain("producer-workflow");
		expect(orchestrator).toContain("producer-workflow-sha");
		expect(orchestrator).toContain("producer-run-id");
		expect(orchestrator).toContain("producer-deployment-id");
		expect(orchestrator).toContain("producer-approval-actor");
	});

	it("copilot compatibility script exists", () => {
		const copilotPath = join(
			REPO_ROOT,
			"packages/mint/test/manual/copilot-compatibility.js",
		);
		expect(existsSync(copilotPath)).toBe(true);
	});

	it("claude e2e script supports tarball-based qualification", () => {
		const claudeE2e = readFileSync(
			join(PACKAGE_ROOT, "test/manual/claude-e2e.js"),
			"utf-8",
		);
		expect(claudeE2e).toContain("MOE_MEMORY_E2E_PLUGIN_DIR");
	});

	it("codex e2e script supports tarball-based qualification", () => {
		const codexE2e = readFileSync(
			join(PACKAGE_ROOT, "test/manual/codex-e2e.js"),
			"utf-8",
		);
		expect(codexE2e).toContain("MOE_MEMORY_E2E_PLUGIN_DIR");
	});
});
