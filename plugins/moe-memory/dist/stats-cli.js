/** `moe-memory stats` — index coverage for both record types. */
import { countJournalEntries, initDatabase } from "./db.js";
import { formatStats, getIndexStats } from "./stats.js";
const HELP = `
Usage: moe-memory stats

Display statistics about the index.

Shows:
- Total conversations and exchanges
- Conversations with/without AI summaries
- Date range coverage
- Project breakdown
- Top projects by conversation count
- Journal entries, by scope

EXAMPLES:
  # Show index statistics
  moe-memory stats
`;
export async function runStats(args) {
    if (args.includes("--help") || args.includes("-h")) {
        console.log(HELP);
        return 0;
    }
    try {
        const stats = await getIndexStats();
        let output = formatStats(stats);
        // The journal half of the store. Reported separately, not folded into the
        // conversation totals: the two record types are not interchangeable and a
        // combined count would hide which one is empty.
        const db = initDatabase();
        try {
            const project = countJournalEntries(db, "project");
            const user = countJournalEntries(db, "user");
            output += `\nJournal Entries: ${(project + user).toLocaleString()}\n`;
            output += `  Project: ${project.toLocaleString()}\n`;
            output += `  User:    ${user.toLocaleString()}\n`;
        }
        finally {
            db.close();
        }
        console.log(output);
        return 0;
    }
    catch (error) {
        console.error("Error getting stats:", error);
        return 1;
    }
}
