import type { MemoryDatabase } from "./db.js";
export declare function withTransaction<T>(db: MemoryDatabase, body: () => T): T;
export declare function withForeignKeysDisabled<T>(db: MemoryDatabase, body: () => T): T;
