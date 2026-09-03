/** `moe-memory search` — conversation search from the terminal. */
import { formatMultiConceptResults, formatResults, searchConversations, searchMultipleConcepts, } from "./search.js";
const HELP = `
Usage: moe-memory search [OPTIONS] <query>

Search indexed conversations using semantic similarity or exact text matching.
For journal entries, use \`moe-memory journal search\`.

MODES:
  (default)      Combined vector + text search
  --vector       Vector similarity only (semantic)
  --text         Exact string matching only (for git SHAs, error codes)

OPTIONS:
  --after DATE          Only conversations after YYYY-MM-DD
  --before DATE         Only conversations before YYYY-MM-DD
  --project NAME        Filter by project name (exact match)
  --session-id ID       Filter by session ID (exact match)
  --git-branch BRANCH   Filter by git branch name (exact match)
  --git-commit SHA      Filter by git commit SHA (exact match)
  --limit N             Max results (default: 10)
  --help, -h            Show this help

EXAMPLES:
  # Semantic search
  moe-memory search "React Router authentication errors"

  # Find exact string
  moe-memory search --text "a1b2c3d4e5f6"

  # Time filtering
  moe-memory search --after 2025-09-01 "refactoring"

  # Filter to one project
  moe-memory search --project my-app "auth flow"

  # Filter to one git branch
  moe-memory search --git-branch feature/login "validation"

  # Filter to one commit
  moe-memory search --git-commit a1b2c3d "what changed"

  # Multi-concept search (AND - all concepts must match)
  moe-memory search "React Router" "authentication" "JWT"
`;
export async function runSearch(args) {
    let mode = "both";
    let after;
    let before;
    let project;
    let sessionId;
    let gitBranch;
    let gitCommit;
    let limit = 10;
    const queries = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--help" || arg === "-h") {
            console.log(HELP);
            return 0;
        }
        if (arg === "--vector") {
            mode = "vector";
        }
        else if (arg === "--text") {
            mode = "text";
        }
        else if (arg === "--both") {
            mode = "both";
        }
        else if (arg === "--after") {
            after = args[++i];
        }
        else if (arg === "--before") {
            before = args[++i];
        }
        else if (arg === "--project") {
            project = args[++i];
        }
        else if (arg === "--session-id") {
            sessionId = args[++i];
        }
        else if (arg === "--git-branch") {
            gitBranch = args[++i];
        }
        else if (arg === "--git-commit") {
            gitCommit = args[++i];
        }
        else if (arg === "--limit") {
            const raw = args[++i];
            const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
            // An empty or non-numeric --limit used to become NaN and silently break
            // the query. Reject it instead.
            if (!Number.isFinite(parsed) || parsed < 1) {
                console.error(`Invalid --limit value: ${raw ?? "(missing)"}`);
                return 1;
            }
            limit = parsed;
        }
        else if (arg !== undefined) {
            // All non-flag args are query terms
            queries.push(arg);
        }
    }
    if (queries.length === 0) {
        console.error("Usage: moe-memory search [OPTIONS] <query> [query2] [query3]...");
        console.error("Try: moe-memory search --help");
        return 1;
    }
    try {
        // Multi-concept search if multiple queries provided
        if (queries.length > 1) {
            const options = {
                limit,
                after,
                before,
                project,
                session_id: sessionId,
                git_branch: gitBranch,
                git_commit: gitCommit,
            };
            const results = await searchMultipleConcepts(queries, options);
            console.log(await formatMultiConceptResults(results, queries));
            return 0;
        }
        const options = {
            mode,
            limit,
            after,
            before,
            project,
            session_id: sessionId,
            git_branch: gitBranch,
            git_commit: gitCommit,
        };
        const first = queries[0];
        if (first === undefined)
            return 1;
        const results = await searchConversations(first, options);
        console.log(await formatResults(results));
        return 0;
    }
    catch (error) {
        console.error("Error searching:", error);
        return 1;
    }
}
