import { gitIn, primaryRoot } from "./util.js";

const CR_ID_PATTERN = /^CR-\d{3}$/;

function validateCrId(crId: string): void {
  if (!CR_ID_PATTERN.test(crId)) {
    throw new Error(
      `Invalid CR-ID "${crId}". Expected format: CR-### (e.g. CR-012).`,
    );
  }
}

export interface ReviewStampOpts {
  cwd?: string;
}

export function reviewStamp(
  crId: string,
  fixingSha: string,
  opts?: ReviewStampOpts,
): string {
  validateCrId(crId);

  const cwd = opts?.cwd ?? process.cwd();
  const root = primaryRoot(cwd);

  // Resolve fixing SHA to full commit hash
  let resolvedSha: string;
  try {
    resolvedSha = gitIn(root, "rev-parse", "--verify", `${fixingSha}^{commit}`);
  } catch {
    throw new Error(
      `"${fixingSha}" does not resolve to a commit in this repository.`,
    );
  }

  // Verify the fixing SHA is an ancestor of HEAD
  try {
    gitIn(root, "merge-base", "--is-ancestor", resolvedSha, "HEAD");
  } catch {
    throw new Error(
      `"${fixingSha}" is not reachable from HEAD. The fix must be on the current branch before stamping.`,
    );
  }

  // Check for clean working tree
  try {
    gitIn(root, "diff-index", "--quiet", "HEAD", "--");
  } catch {
    throw new Error(
      "Working tree is dirty. Commit or stash changes before creating a stamp.",
    );
  }

  // Create the stamp commit
  const message = `fix(review): ${crId} — addressed by ${resolvedSha}`;
  gitIn(root, "commit", "--allow-empty", "-m", message);

  return gitIn(root, "rev-parse", "HEAD");
}
