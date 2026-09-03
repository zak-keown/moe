import { setDefaultPackageRoot } from "./db.js";
import { resolveInstalledPackageRoot } from "./installed-package-root.js";

setDefaultPackageRoot(resolveInstalledPackageRoot(import.meta.url));

export * from "./constants.js";
export {
  acquireDatabaseWriter,
  acquireExclusiveMaintenanceLease,
  acquireSharedDatabaseLease,
  assertWritableEpoch,
  DatabaseBusyError,
  type DatabaseLease,
  type DatabaseWriter,
  inspectLegacyDatabaseUsers,
  readDatabaseEpoch,
  withDatabaseWriter,
} from "./database-lease.js";
export {
  collectSnapshotSources,
  createDatabaseSnapshot,
  type SnapshotResult,
  type SnapshotSidecar,
  type SnapshotSourceRecord,
  validateSnapshotSources,
  verifySnapshot,
} from "./database-snapshot.js";
export { withForeignKeysDisabled, withTransaction } from "./database-transaction.js";
export {
  createEmbeddingCoordinator,
  type EmbeddingCoordinator,
  type EmbeddingCoordinatorOptions,
} from "./embedding-coordinator.js";
export {
  commitEnrichment,
  type JournalTextResult,
  type PendingEnrichment,
  pickPendingEnrichment,
  searchJournalText as searchJournalTextDb,
} from "./enrichment.js";
export * from "./parser.js";
export * from "./paths.js";
export {
  ensureRecoveryCapsule,
  type IntegrityFile,
  loadCatalog as loadRecoveryCatalog,
  RecoveryCapsuleError,
  type RecoveryCapsuleManifest,
  type RecoveryCatalog,
  type RecoveryCatalogEntry,
  type VerifiedRecoveryCapsule,
  validateManifest as validateCapsuleManifest,
  verifyRecoveryCapsule,
} from "./recovery-capsule.js";
export * from "./search.js";
export * from "./types.js";
export {
  assessVectorReadiness,
  isVectorQueryAuthorized,
  type VectorReadiness,
  vectorReadinessMessage,
} from "./vector-readiness.js";
