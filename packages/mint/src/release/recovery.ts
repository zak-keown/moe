
import type { CandidateLockV1 } from './catalog.js'

export type ResumeAction =
  | { kind: 'publish'; plugin: string; tarball: string }
  | { kind: 'accept-existing'; plugin: string }
  | { kind: 'block'; plugin?: string; code: string; message: string }

export interface RegistrySnapshot {
  plugin: string
  package: string
  version: string
  tarballIntegrity: string
  state: 'absent' | 'present'
  observedIntegrity?: string
  draftAssetPresent: boolean
  draftAssetSha256?: string
}

export function computeResumeActions(
  lock: CandidateLockV1,
  snapshots: readonly RegistrySnapshot[],
): readonly ResumeAction[] {
  const actions: ResumeAction[] = []

  for (const plugin of lock.plugins) {
    if (!plugin.changed) {
      actions.push({ kind: 'accept-existing', plugin: plugin.plugin })
      continue
    }

    const snapshot = snapshots.find((s) => s.plugin === plugin.plugin)
    if (snapshot === undefined) {
      actions.push({
        kind: 'block',
        plugin: plugin.plugin,
        code: 'RECOVERY_SNAPSHOT_MISSING',
        message: `no registry snapshot for plugin "${plugin.plugin}"`,
      })
      continue
    }

    if (snapshot.state === 'present') {
      if (snapshot.observedIntegrity === plugin.artifact.tarball.integrity) {
        actions.push({ kind: 'accept-existing', plugin: plugin.plugin })
      } else {
        actions.push({
          kind: 'block',
          plugin: plugin.plugin,
          code: 'RECOVERY_INTEGRITY_MISMATCH',
          message: `plugin "${plugin.plugin}" is published with different integrity`,
        })
      }
      continue
    }

    const tarballAsset = lock.release_assets.find(
      (a) => a.kind === 'tarball' && a.name === plugin.artifact.mirror.asset,
    )
    if (tarballAsset === undefined) {
      actions.push({
        kind: 'block',
        plugin: plugin.plugin,
        code: 'RECOVERY_LOCK_INCONSISTENT',
        message: `no tarball asset recorded in lock for "${plugin.plugin}"`,
      })
      continue
    }

    if (!snapshot.draftAssetPresent) {
      actions.push({
        kind: 'block',
        plugin: plugin.plugin,
        code: 'RECOVERY_DRAFT_ASSET_MISSING',
        message: `draft asset "${plugin.artifact.mirror.asset}" missing after partial publication`,
      })
      continue
    }

    if (snapshot.draftAssetSha256 === undefined) {
      actions.push({
        kind: 'block',
        plugin: plugin.plugin,
        code: 'RECOVERY_DRAFT_ASSET_UNVERIFIABLE',
        message: `draft asset "${plugin.artifact.mirror.asset}" SHA-256 could not be observed; cannot verify it matches the lock`,
      })
      continue
    }

    if (snapshot.draftAssetSha256 !== tarballAsset.sha256) {
      actions.push({
        kind: 'block',
        plugin: plugin.plugin,
        code: 'RECOVERY_DRAFT_ASSET_MISMATCH',
        message: `draft asset "${plugin.artifact.mirror.asset}" SHA-256 does not match lock`,
      })
      continue
    }

    actions.push({
      kind: 'publish',
      plugin: plugin.plugin,
      tarball: plugin.artifact.mirror.asset,
    })
  }

  return actions
}

export function hasBlockingActions(actions: readonly ResumeAction[]): boolean {
  return actions.some((a) => a.kind === 'block')
}

export function publishableActions(actions: readonly ResumeAction[]): readonly (ResumeAction & { kind: 'publish' })[] {
  return actions.filter((a): a is ResumeAction & { kind: 'publish' } => a.kind === 'publish')
}
