import type { BundledPackage } from './bundle-inventory.js'
import type { ImportedWorkRef } from '../config.js'
import type { StagedImportRecord } from './staged-imports.js'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface NoticeWork {
  readonly name: string
  readonly revision: string
  readonly license: string
  readonly copyrightNotice: string
}
export interface NoticeRegister { readonly works: ReadonlyMap<string, NoticeWork> }
export type LegalPayloadPath = 'LICENSE' | 'NOTICE'
export interface ArtifactLicenseRecord {
  readonly path: LegalPayloadPath
  readonly bytes: Uint8Array
}
export interface BundledLicenseRecord {
  readonly work: string
  readonly license: Buffer
  readonly notice?: Buffer | undefined
  readonly declaredLicense: string
}
export interface LegalDiagnostic { readonly code: string; readonly work?: string; readonly message: string }
export const LEGAL_TEMPLATE_SHA256 = Object.freeze({
  'LICENSE-BSD-3-CLAUSE': 'b010b0dfdfdb23d7396e03b82cd4621fc9bb8f95d6b0aea70b9c24e12074c786',
  'LICENSE-ISC': '80d3168ad2f70f6f5bb2ab22b23414707abf6f0a392034891481ae36a1a429d4',
})
export type CanonicalLegalTemplate = keyof typeof LEGAL_TEMPLATE_SHA256

class LegalError extends Error {
  readonly diagnostic: { readonly severity: 'error'; readonly code: string; readonly source: string; readonly message: string; readonly action: string }
  constructor(diagnostic: { readonly severity: 'error'; readonly code: string; readonly source: string; readonly message: string; readonly action: string }) {
    super(diagnostic.message)
    this.name = 'LegalError'
    this.diagnostic = diagnostic
  }
}

export async function readArtifactLicenseRecords(artifactRoot: string): Promise<readonly ArtifactLicenseRecord[]> {
  return Object.freeze(await Promise.all((['LICENSE', 'NOTICE'] as const).map(async (path) => ({
    path,
    bytes: await readFile(join(artifactRoot, path)),
  }))))
}

export async function readBundledLicenseRecords(repositoryRoot: string, bundledPackages: readonly BundledPackage[]): Promise<readonly BundledLicenseRecord[]> {
  const records: BundledLicenseRecord[] = []
  for (const bundle of bundledPackages) {
    const directory = dirname(join(repositoryRoot, bundle.package_manifest))
    const manifest = JSON.parse(await readFile(join(repositoryRoot, bundle.package_manifest), 'utf8')) as Record<string, unknown>
    if (manifest.name !== bundle.name || manifest.version !== bundle.version || typeof manifest.license !== 'string' || manifest.license.length === 0) {
      failure('LEGAL_PACKAGE_MANIFEST_CONFLICT', `bundled package manifest for "${bundle.name}" does not match its inventory identity and declared license`)
    }
    const names = (await readdir(directory)).sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    const licenseNames = names.filter((name) => /^licen[cs]e(?:\.|$)/i.test(name))
    const noticeNames = names.filter((name) => /^notice(?:\.|$)/i.test(name))
    if (licenseNames.length > 1) failure('LEGAL_PACKAGE_LICENSE_AMBIGUOUS', `bundled package "${bundle.name}" has multiple candidate LICENSE files: ${licenseNames.join(', ')}`)
    if (noticeNames.length > 1) failure('LEGAL_PACKAGE_NOTICE_AMBIGUOUS', `bundled package "${bundle.name}" has multiple candidate NOTICE files: ${noticeNames.join(', ')}`)
    const licenseName = licenseNames[0]
    if (licenseName === undefined) continue
    const noticeName = noticeNames[0]
    records.push({
      work: bundle.name,
      license: await readFile(join(directory, licenseName)),
      ...(noticeName === undefined ? {} : { notice: await readFile(join(directory, noticeName)) }),
      declaredLicense: manifest.license,
    })
  }
  return records
}

function failure(code: string, message: string): never {
  throw new LegalError({ severity: 'error', code, source: 'NOTICE', message, action: 'Keep one exact imported-work identity and complete legal evidence.' })
}

export async function readCanonicalLegalTemplates(repositoryRoot: string): Promise<Readonly<Record<CanonicalLegalTemplate, string>>> {
  const entries = await Promise.all(Object.entries(LEGAL_TEMPLATE_SHA256).map(async ([file, expected]) => {
    let bytes: Buffer
    try {
      bytes = await readFile(join(repositoryRoot, file))
    } catch {
      failure('LEGAL_TEMPLATE_MISSING', `canonical legal template "${file}" could not be read`)
    }
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (actual !== expected) failure('LEGAL_TEMPLATE_DRIFT', `canonical legal template "${file}" does not match its reviewed digest`)
    return [file, bytes.toString('utf8')] as const
  }))
  return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<CanonicalLegalTemplate, string>>
}

function detectedLicenseFamily(bytes: Uint8Array): string | undefined {
  const text = Buffer.from(bytes).toString('utf8').replace(/\r?\n/g, ' ')
  if (text.includes('Permission to use, copy, modify, and/or distribute this software for any')
    && text.includes('purpose with or without fee is hereby granted')) return 'ISC'
  if (text.includes('Permission is hereby granted, free of charge')) {
    return 'MIT'
  }
  if (text.includes('Redistribution and use in source and binary forms')) return 'BSD-3-Clause'
  if (text.includes('Apache License') && text.includes('Version 2.0')) return 'Apache-2.0'
  return undefined
}

export function parseNotice(text: string): NoticeRegister {
  const works = new Map<string, NoticeWork>()
  let active = false
  for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
    if (line === '## Imported works') { active = true; continue }
    if (active && line.startsWith('## ')) break
    if (!active || !line.startsWith('| `')) continue
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    const name = /^`([^`]+)`$/.exec(cells[0] ?? '')?.[1]
    const revision = /^`([^`]+)`(?:\s.*)?$/.exec(cells[1] ?? '')?.[1]
    const license = cells[2]
    const copyrightNotice = cells[3]
    if (name === undefined || revision === undefined || license === undefined || copyrightNotice === undefined) failure('LEGAL_NOTICE_INVALID', `malformed NOTICE row: ${line}`)
    if (works.has(name)) failure('LEGAL_NOTICE_DUPLICATE', `duplicate NOTICE work "${name}"`)
    works.set(name, { name, revision, license, copyrightNotice })
  }
  return { works }
}

export function reconcileLegalClosure(input: {
  readonly bundledPackages: readonly BundledPackage[]
  readonly stagedImports: readonly StagedImportRecord[]
  readonly importedWorks: readonly ImportedWorkRef[]
  readonly notice: NoticeRegister
  readonly artifactLicenses: readonly ArtifactLicenseRecord[]
  readonly bundledLicenses: readonly BundledLicenseRecord[]
  readonly expectedLegalPayload: Readonly<Record<LegalPayloadPath, Uint8Array>>
  readonly artifactPaths: ReadonlySet<string>
}): readonly LegalDiagnostic[] {
  const diagnostics: LegalDiagnostic[] = []
  const declared = new Map(input.importedWorks.map((work) => [work.name, work]))
  const evidence = new Set([...input.bundledPackages.map((row) => row.name), ...input.stagedImports.map((row) => row.work)])
  const artifactLicenses = new Map<LegalPayloadPath, Uint8Array>()
  for (const record of input.artifactLicenses) {
    if (artifactLicenses.has(record.path)) diagnostics.push({ code: 'LEGAL_PAYLOAD_DUPLICATE', message: `duplicate staged legal payload "${record.path}"` })
    artifactLicenses.set(record.path, record.bytes)
  }
  for (const path of ['LICENSE', 'NOTICE'] as const) {
    const observed = artifactLicenses.get(path)
    if (observed === undefined) diagnostics.push({ code: 'LEGAL_PAYLOAD_MISSING', message: `staged artifact is missing ${path}` })
    else if (!Buffer.from(observed).equals(Buffer.from(input.expectedLegalPayload[path]))) diagnostics.push({ code: 'LEGAL_PAYLOAD_DRIFT', message: `staged ${path} differs from the canonical rendered payload` })
  }
  const bundledLicenses = new Map<string, BundledLicenseRecord>()
  for (const record of input.bundledLicenses) {
    if (bundledLicenses.has(record.work)) diagnostics.push({ code: 'LEGAL_LICENSE_DUPLICATE', work: record.work, message: `duplicate bundled license evidence for "${record.work}"` })
    bundledLicenses.set(record.work, record)
  }
  for (const work of evidence) {
    if (!declared.has(work)) diagnostics.push({ code: 'LEGAL_IMPORT_MISSING', work, message: `evidenced work "${work}" is absent from imported_works` })
    if (!input.notice.works.has(work)) diagnostics.push({ code: 'LEGAL_NOTICE_MISSING', work, message: `evidenced work "${work}" is absent from NOTICE` })
    const notice = input.notice.works.get(work)
    const bundledLicense = bundledLicenses.get(work)
    if (input.bundledPackages.some((bundle) => bundle.name === work)) {
      if ((bundledLicense === undefined || bundledLicense.license.length === 0) && (!declared.has(work) || !input.notice.works.has(work))) diagnostics.push({ code: 'LEGAL_LICENSE_MISSING', work, message: `bundled work "${work}" has no observed license bytes` })
      if (bundledLicense !== undefined && notice !== undefined && bundledLicense.declaredLicense !== notice.license) diagnostics.push({ code: 'LEGAL_LICENSE_MISMATCH', work, message: `license for "${work}" differs between package manifest and NOTICE` })
      if (bundledLicense !== undefined && notice !== undefined) {
        const family = detectedLicenseFamily(bundledLicense.license)
        const copyrights = notice.copyrightNotice.split(';').map((value) => value.trim()).filter(Boolean)
        const searchBytes = bundledLicense.notice !== undefined ? Buffer.concat([bundledLicense.license, bundledLicense.notice]) : bundledLicense.license
        const isApacheTemplate = family === 'Apache-2.0' && bundledLicense.license.includes(Buffer.from('Copyright [yyyy] [name of copyright owner]'))
        if (family !== notice.license || (!isApacheTemplate && copyrights.some((value) => !searchBytes.includes(Buffer.from(value))))) {
          diagnostics.push({ code: 'LEGAL_LICENSE_CONTENT_MISMATCH', work, message: `observed license bytes for "${work}" do not contain the declared family and copyright evidence` })
        }
      }
    }
  }
  for (const bundle of input.bundledPackages) {
    const notice = input.notice.works.get(bundle.name)
    if (notice !== undefined && notice.revision !== bundle.version) diagnostics.push({ code: 'LEGAL_REVISION_MISMATCH', work: bundle.name, message: `NOTICE revision for "${bundle.name}" does not equal bundled npm version ${bundle.version}` })
    for (const output of bundle.outputs) if (!input.artifactPaths.has(output)) diagnostics.push({ code: 'LEGAL_BUNDLE_OUTPUT_MISSING', work: bundle.name, message: `bundle output "${output}" is absent from the artifact` })
  }
  for (const work of declared.keys()) if (!evidence.has(work)) diagnostics.push({ code: 'LEGAL_IMPORT_UNREPRESENTED', work, message: `declared imported work "${work}" has no staged or bundle evidence` })
  return Object.freeze(diagnostics.sort((left, right) => Buffer.compare(Buffer.from(left.code), Buffer.from(right.code)) || Buffer.compare(Buffer.from(left.work ?? ''), Buffer.from(right.work ?? ''))))
}

export function assertLegalClosure(input: Parameters<typeof reconcileLegalClosure>[0]): void {
  const diagnostics = reconcileLegalClosure(input)
  if (diagnostics.length > 0) failure(diagnostics[0]!.code, diagnostics.map((entry) => entry.message).join('; '))
}
