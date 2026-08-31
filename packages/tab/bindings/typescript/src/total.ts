// Prints just `total_usd`, for scripts/validate-bindings.sh to compare across
// languages. Built to dist/total.js; run as `node dist/total.js <file> <dialect>`.
import { type Dialect, estimatePath } from "./index.js";

// Keyed by Dialect so adding a member to the union without listing it here is a
// compile error, rather than a CLI that silently rejects a valid dialect.
const DIALECTS: Record<Dialect, true> = { atif: true, tab: true };

function isDialect(s: string): s is Dialect {
  return Object.hasOwn(DIALECTS, s);
}

const path = process.argv[2];
const dialect = process.argv[3];
if (!path || !dialect || !isDialect(dialect)) {
  console.error(`usage: total <transcript> <${Object.keys(DIALECTS).join("|")}>`);
  process.exit(2);
}
const est = await estimatePath(path, dialect);
console.log(est.total_usd);
