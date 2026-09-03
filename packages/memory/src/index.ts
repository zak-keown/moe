import { resolveInstalledPackageRoot } from "./installed-package-root.js";
import { setDefaultPackageRoot } from "./db.js";

setDefaultPackageRoot(resolveInstalledPackageRoot(import.meta.url));

export * from "./constants.js";
export {
  DatabaseBusyError,
  acquireSharedDatabaseLease,
  acquireDatabaseWriter,
  acquireExclusiveMaintenanceLease,
  assertWritableEpoch,
  inspectLegacyDatabaseUsers,
  readDatabaseEpoch,
  withDatabaseWriter,
  type DatabaseLease,
  type DatabaseWriter,
} from "./database-lease.js";
export { withTransaction, withForeignKeysDisabled } from "./database-transaction.js";
export {
  pickPendingEnrichment,
  commitEnrichment,
  searchJournalText as searchJournalTextDb,
  type PendingEnrichment,
  type JournalTextResult,
} from "./enrichment.js";
export {
  RecoveryCapsuleError,
  verifyRecoveryCapsule,
  ensureRecoveryCapsule,
  validateManifest as validateCapsuleManifest,
  loadCatalog as loadRecoveryCatalog,
  type RecoveryCapsuleManifest,
  type VerifiedRecoveryCapsule,
  type RecoveryCatalog,
  type RecoveryCatalogEntry,
  type IntegrityFile,
} from "./recovery-capsule.js";
export * from "./parser.js";
export * from "./paths.js";
export * from "./search.js";
export * from "./types.js";
