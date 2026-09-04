import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

let directory = dirname(fileURLToPath(import.meta.url))
let target
for (;;) {
  const candidate = join(directory, 'hooks', 'plan-set')
  if (existsSync(candidate)) {
    target = candidate
    break
  }
  const parent = dirname(directory)
  if (parent === directory) {
    process.stderr.write('plan-set launcher: plugin hooks/plan-set was not found\n')
    process.exit(2)
  }
  directory = parent
}

const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
