/**
 * Line-based diff between two HTML strings using Myers' algorithm.
 * Returns a human-readable summary with REMOVED and ADDED sections,
 * capped at 50 lines per side with "and N more" footer. Used by
 * capturePageArtifacts to attach a diff to the captured page state.
 *
 * Myers (not set-based) so reordered identical lines are correctly
 * detected as a remove + add pair, not "no changes."
 *
 * Pure function. Hand-rolled — no npm dependency.
 */

const MAX_LINES_PER_SIDE = 50;
const MAX_LINE_LENGTH = 200;

// myersDiff's `trace` stores a full snapshot of its O(N+M)-wide `v` array on
// every edit-distance step, so its memory is O(D*(N+M)) with D bounded only
// by N+M itself (two completely different documents make D = N+M). There is
// no cap on N or M below this, so two ordinary-sized but dissimilar
// documents can exhaust the process heap — a V8 OOM is a hard process abort,
// not a catchable exception, so it takes the whole MCP server down (CR-059,
// CR-060). Bail out to a cheap, O(N+M)-memory summary above this budget
// instead of ever entering the Myers loop.
//
// CR-049: memory for the worst case (every line differs, so D = N+M) grows
// quadratically with lines/side — empirically ~64 * L^2 bytes for L
// lines/side on each of two documents (500 -> ~16MB, 1000 -> ~62MB,
// 2000 -> ~246MB). A cap of 2000 therefore still allowed a single call to
// allocate ~250MB, easily enough to OOM-kill the server under a
// container/shared-host memory budget — the exact failure mode this cap
// exists to prevent. 300 lines/side bounds the worst case to single-digit
// MB while still covering the overwhelming majority of real DOM diffs.
const MAX_DIFFABLE_LINES_PER_SIDE = 300;

// Myers' O((N+M)D) shortest-edit-script. Returns an array of
// { type: 'eq'|'del'|'add', value: string } operations in order.
function myersDiff(a, b) {
  const N = a.length;
  const M = b.length;
  const max = N + M;
  const v = new Array(2 * max + 1);
  const trace = [];

  v[max + 1] = 0;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[max + k - 1] < v[max + k + 1])) {
        x = v[max + k + 1];
      } else {
        x = v[max + k - 1] + 1;
      }
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) {
        x++; y++;
      }
      v[max + k] = x;
      if (x >= N && y >= M) {
        // Backtrack through the trace to build the edit script.
        return backtrack(trace, a, b, N, M, max);
      }
    }
  }
  return [];
}

function backtrack(trace, a, b, N, M, max) {
  const ops = [];
  let x = N;
  let y = M;
  for (let d = trace.length - 1; d > 0; d--) {
    const v = trace[d];
    const k = x - y;
    let prevK;
    if (k === -d || (k !== d && v[max + k - 1] < v[max + k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = v[max + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ type: 'eq', value: a[x - 1] });
      x--; y--;
    }
    if (d > 0) {
      if (x === prevX) {
        ops.push({ type: 'add', value: b[y - 1] });
        y--;
      } else {
        ops.push({ type: 'del', value: a[x - 1] });
        x--;
      }
    }
  }
  while (x > 0 && y > 0) {
    ops.push({ type: 'eq', value: a[x - 1] });
    x--; y--;
  }
  return ops.reverse();
}

// Cheap (O(N+M) time, no quadratic allocation) stand-in for a full diff when
// the input is too large to run Myers on safely. Reports sizes and, when
// cheap to find, the first line where the two sides diverge.
function cheapOversizeSummary(before, after, beforeLines, afterLines) {
  if (before === after) return '(no changes detected)';

  const minLen = Math.min(beforeLines.length, afterLines.length);
  let firstDiffAt = -1;
  for (let i = 0; i < minLen; i++) {
    if (beforeLines[i] !== afterLines[i]) { firstDiffAt = i; break; }
  }
  if (firstDiffAt === -1 && beforeLines.length !== afterLines.length) {
    firstDiffAt = minLen;
  }

  const trunc = (s) => (s === undefined ? '(none)' : s.slice(0, MAX_LINE_LENGTH));
  let summary = `(diff skipped: before has ${beforeLines.length} line(s), after has ${afterLines.length} line(s) — ` +
    `over the ${MAX_DIFFABLE_LINES_PER_SIDE}-line safety cap, too large to diff in full)`;
  if (firstDiffAt !== -1) {
    summary += `\nFirst difference at line ${firstDiffAt + 1}:\n` +
      `- ${trunc(beforeLines[firstDiffAt])}\n` +
      `+ ${trunc(afterLines[firstDiffAt])}`;
  }
  return summary;
}

function generateHtmlDiff(beforeHtml, afterHtml) {
  const before = beforeHtml || '';
  const after = afterHtml || '';
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  if (beforeLines.length > MAX_DIFFABLE_LINES_PER_SIDE || afterLines.length > MAX_DIFFABLE_LINES_PER_SIDE) {
    return cheapOversizeSummary(before, after, beforeLines, afterLines);
  }

  const ops = myersDiff(beforeLines, afterLines);

  const removed = ops.filter(o => o.type === 'del' && o.value.trim()).map(o => o.value);
  const added = ops.filter(o => o.type === 'add' && o.value.trim()).map(o => o.value);

  let diff = '';
  if (removed.length > 0) {
    diff += '=== REMOVED ===\n';
    diff += removed.slice(0, MAX_LINES_PER_SIDE)
      .map(l => '- ' + l.slice(0, MAX_LINE_LENGTH))
      .join('\n');
    if (removed.length > MAX_LINES_PER_SIDE) {
      diff += `\n... and ${removed.length - MAX_LINES_PER_SIDE} more removed lines`;
    }
    diff += '\n\n';
  }
  if (added.length > 0) {
    diff += '=== ADDED ===\n';
    diff += added.slice(0, MAX_LINES_PER_SIDE)
      .map(l => '+ ' + l.slice(0, MAX_LINE_LENGTH))
      .join('\n');
    if (added.length > MAX_LINES_PER_SIDE) {
      diff += `\n... and ${added.length - MAX_LINES_PER_SIDE} more added lines`;
    }
  }

  if (!diff) {
    diff = '(no changes detected)';
  }

  return diff;
}

module.exports = { generateHtmlDiff };
