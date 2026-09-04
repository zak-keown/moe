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

const CONFIG_DIAGNOSTIC: ConfigErrorDiagnostic = {
  code: 'CONFIG_INVALID',
  source: 'moe-mint.yaml',
  action: 'Correct the configuration and run the command again.',
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

export function configError(message: string, details: string[] = [], opts: ConfigErrorOptions = {}): ConfigError {
  return new ConfigError(message, details, {
    ...opts,
    diagnostic: opts.diagnostic ?? { ...CONFIG_DIAGNOSTIC, source: opts.source ?? CONFIG_DIAGNOSTIC.source },
  })
}
