import { root } from '@bubstack/package-consumer'
import { server } from '@bubstack/package-consumer/server'

process.stdout.write(JSON.stringify({ root, server }))
