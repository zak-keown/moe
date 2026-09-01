// Public API for the @tc/moe-memory package.
//
// This file is a pure re-export barrel with no side effects. private-journal-mcp
// also had a `src/index.ts` — but theirs was the executable entry point, with a
// shebang, argv parsing and a server boot. Both names could not survive in place;
// the barrel keeps the filename and the executable became src/cli.ts, which is
// what the package's single `bin` points at.
export * from "./constants.js";
export * from "./db.js";
export * from "./embedding-migration.js";
export * from "./embeddings.js";
export * from "./indexer.js";
export * from "./journal/index.js";
export * from "./parser.js";
export * from "./paths.js";
export * from "./search.js";
export * from "./summarizer.js";
export * from "./types.js";
