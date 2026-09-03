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

export type ConfigErrorDiagnostic = Omit<MintDiagnostic, 'severity' | 'message'>

export interface ConfigErrorOptions {
  cause?: unknown
  diagnostic?: ConfigErrorDiagnostic
  source?: string
}

const OPERATION_DIAGNOSTIC: ConfigErrorDiagnostic = {
  code: 'MINT_OPERATION_INVALID',
  source: 'moe-mint',
  action: 'Resolve the reported operational issue and retry.',
}

export class ConfigError extends MintError {
  details: string[]
  constructor(message: string, details: string[] = [], opts: ConfigErrorOptions = {}) {
    const diagnostic = opts.diagnostic ?? OPERATION_DIAGNOSTIC
    super({
      severity: 'error',
      ...diagnostic,
      message: details.length ? `${message}\n  - ${details.join('\n  - ')}` : message,
    }, { cause: opts.cause })
    this.name = 'ConfigError'
    this.details = details
  }
}
