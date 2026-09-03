import { constants } from 'node:fs'
import { open, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MintError } from '../diagnostics.js'

interface AttributionRow {
  readonly name: string
  readonly revision: string
  readonly license: string
  readonly copyright: string
  readonly sourceLine: string
}

export interface LicensePayloadInput {
  readonly repoRoot: string
  readonly pluginId: string
  readonly license: string | undefined
  readonly importedWorks: readonly string[]
}

export interface WriteLicensePayloadInput extends LicensePayloadInput {
  readonly artifactRoot: string
}

export interface LicensePayload {
  readonly license: string
  readonly notice: string
}

function legalError(code: string, input: LicensePayloadInput, message: string, action: string, field: string): MintError {
  return new MintError({
    severity: 'error',
    code,
    source: 'NOTICE',
    plugin: input.pluginId,
    field,
    message,
    action,
  })
}

function tableCells(line: string): readonly string[] {
  return line.split('|').slice(1, -1).map((cell) => cell.trim())
}

function readAttributions(input: LicensePayloadInput, notice: string): ReadonlyMap<string, AttributionRow> {
  const rows = new Map<string, AttributionRow>()
  let inImportedWorks = false
  for (const line of notice.replaceAll('\r\n', '\n').split('\n')) {
    if (line === '## Imported works') {
      inImportedWorks = true
      continue
    }
    if (inImportedWorks && line.startsWith('## ')) break
    if (!inImportedWorks || !line.startsWith('| `')) continue
    const [rawName, revision, license, copyright] = tableCells(line)
    const name = /^`([^`]+)`$/.exec(rawName ?? '')?.[1]
    if (name === undefined || revision === undefined || license === undefined || copyright === undefined) {
      throw legalError(
        'ARTIFACT_NOTICE_MALFORMED',
        input,
        `root NOTICE contains a malformed imported-work row: ${line}`,
        'Correct the root NOTICE attribution table before assembling artifacts.',
        'imported_works',
      )
    }
    if (rows.has(name)) {
      throw legalError(
        'ARTIFACT_NOTICE_DUPLICATE_WORK',
        input,
        `root NOTICE contains duplicate rows for imported work "${name}"`,
        'Keep exactly one canonical attribution row per imported work.',
        'imported_works',
      )
    }
    rows.set(name, { name, revision, license, copyright, sourceLine: line })
  }
  return rows
}

function compareRawUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

function sourceLicenseFamilies(input: LicensePayloadInput): ReadonlySet<'MIT' | 'Apache-2.0'> {
  const expression = input.license?.trim()
  if (expression === undefined || expression.length === 0) {
    throw legalError(
      'ARTIFACT_LICENSE_MISSING',
      input,
      `plugin "${input.pluginId}" has no source license`,
      'Declare an approved SPDX license in the package-local Mint configuration.',
      'license',
    )
  }
  if (expression === 'MIT') return new Set(['MIT'])
  if (expression === 'Apache-2.0') return new Set(['Apache-2.0'])
  if (expression === 'MIT AND Apache-2.0') return new Set(['MIT', 'Apache-2.0'])
  throw legalError(
    'ARTIFACT_LICENSE_UNSUPPORTED',
    input,
    `plugin "${input.pluginId}" uses unsupported source license expression "${expression}"`,
    'Use a version-1 supported MIT and/or Apache-2.0 expression, or add a reviewed legal composition policy.',
    'license',
  )
}

function importedFamily(input: LicensePayloadInput, row: AttributionRow): 'MIT' | 'Apache-2.0' | 'Public domain' {
  if (row.license.startsWith('No license')) {
    throw legalError(
      'ARTIFACT_LICENSE_GRANT_MISSING',
      input,
      `imported work "${row.name}" has no located license grant`,
      'Remove the work from the distributable artifact or record a valid grant in NOTICE.',
      `imported_works.${row.name}`,
    )
  }
  if (row.license === 'Public domain') return 'Public domain'
  if (row.license.startsWith('MIT')) return 'MIT'
  if (row.license.startsWith('Apache-2.0')) return 'Apache-2.0'
  throw legalError(
    'ARTIFACT_LICENSE_UNSUPPORTED',
    input,
    `imported work "${row.name}" uses unsupported license "${row.license}"`,
    'Add a reviewed legal composition policy before distributing this work.',
    `imported_works.${row.name}`,
  )
}

function mitSection(template: string, copyrights: readonly string[]): string {
  const termsAt = template.indexOf('Permission is hereby granted')
  if (termsAt < 0) throw new Error('LICENSE-MIT is missing the MIT permission terms')
  return `MIT License\n\n${copyrights.join('\n')}\n\n${template.slice(termsAt).trim()}`
}

/** Render the complete legal payload without mutating an artifact tree. */
export async function renderLicensePayload(input: LicensePayloadInput): Promise<LicensePayload> {
  const [rootNotice, rootMit, rootApache] = await Promise.all([
    readFile(join(input.repoRoot, 'NOTICE'), 'utf8'),
    readFile(join(input.repoRoot, 'LICENSE-MIT'), 'utf8'),
    readFile(join(input.repoRoot, 'LICENSE'), 'utf8'),
  ])
  const allRows = readAttributions(input, rootNotice)
  const rows = [...new Set(input.importedWorks)].map((name) => {
    const row = allRows.get(name)
    if (row === undefined) {
      throw legalError(
        'ARTIFACT_NOTICE_WORK_MISSING',
        input,
        `plugin "${input.pluginId}" names imported work "${name}", which root NOTICE does not account for`,
        'Add the exact imported work to NOTICE or remove it from the Mint configuration.',
        `imported_works.${name}`,
      )
    }
    return row
  }).sort((left, right) => compareRawUtf8(left.name, right.name))

  const families = new Set(sourceLicenseFamilies(input))
  const mitCopyrights = new Set<string>()
  if (families.has('MIT')) mitCopyrights.add('Copyright 2026 Zak Keown')
  for (const row of rows) {
    const family = importedFamily(input, row)
    if (family === 'MIT') {
      families.add('MIT')
      mitCopyrights.add(row.copyright.split(';')[0]?.trim() ?? row.copyright)
    } else if (family === 'Apache-2.0') {
      families.add('Apache-2.0')
    }
  }

  const sections: string[] = []
  if (families.has('MIT')) sections.push(mitSection(rootMit, [...mitCopyrights]))
  if (families.has('Apache-2.0')) sections.push(rootApache.trim())
  const license = `${sections.join('\n\n---\n\n')}\n`
  const noticeLines = [
    'Moe',
    'Copyright 2026 Zak Keown',
    '',
    'THIRD-PARTY ATTRIBUTION',
    '',
    '## Imported works',
    '',
    ...(rows.length === 0
      ? ['No imported works are included in this artifact.']
      : [
          '| Project | Revision | License | Copyright notice |',
          '|---|---:|---|---|',
          ...rows.map((row) => row.sourceLine),
        ]),
    '',
  ]
  return { license, notice: noticeLines.join('\n') }
}

async function writeNew(path: string, contents: string): Promise<void> {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644)
  try {
    await handle.writeFile(contents, 'utf8')
  } finally {
    await handle.close()
  }
}

/** Write the already-rendered, artifact-scoped LICENSE and NOTICE pair. */
export async function writeLicensePayload(input: WriteLicensePayloadInput): Promise<LicensePayload> {
  const payload = await renderLicensePayload(input)
  await writeNew(join(input.artifactRoot, 'LICENSE'), payload.license)
  await writeNew(join(input.artifactRoot, 'NOTICE'), payload.notice)
  return payload
}
