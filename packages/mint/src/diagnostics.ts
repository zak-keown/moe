export interface MintDiagnostic {
  severity: 'error' | 'warning'
  code: string
  plugin?: string
  target?: string
  source: string
  field?: string
  path?: string
  owners?: readonly string[]
  message: string
  action: string
}

export class MintError extends Error {
  constructor(
    readonly diagnostic: MintDiagnostic,
    opts: ErrorOptions = {},
  ) {
    super(diagnostic.message, opts)
    this.name = 'MintError'
  }
}
