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

// Above this many combined input lines, Myers' trace below -- a full
// frontier snapshot (`v.slice()`) pushed onto `trace` at *every* depth --
// allocates O(D * (N + M)) memory with no cap on either input. Two large,
// mostly-different documents (whole-document outerHTML before/after a
// route change, say) exhaust the heap before the backtrack step is ever
// reached. Above this size, fall back to a cheap O(N + M) multiset diff
// instead (see CR-033).
const MAX_DIFF_INPUT_LINES = 3000;

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

// Cheap O(N + M) fallback for inputs too large for Myers (see
// MAX_DIFF_INPUT_LINES): counts each line's occurrences on both sides and
// reports the excess as removed/added. Order-insensitive -- a large block
// that is only reordered, not changed, reports as "no changes" -- which is
// an acceptable tradeoff for documents this large; the alternative is the
// unbounded trace allocation this fallback exists to avoid.
function multisetDiff(a, b) {
  const countA = new Map();
  for (const line of a) countA.set(line, (countA.get(line) || 0) + 1);
  const countB = new Map();
  for (const line of b) countB.set(line, (countB.get(line) || 0) + 1);

  const removed = [];
  const added = [];
  const keys = new Set([...countA.keys(), ...countB.keys()]);
  for (const key of keys) {
    const inA = countA.get(key) || 0;
    const inB = countB.get(key) || 0;
    for (let i = 0; i < inA - inB; i++) removed.push(key);
    for (let i = 0; i < inB - inA; i++) added.push(key);
  }
  return { removed, added };
}

function diffOps(a, b) {
  const ops = myersDiff(a, b);
  return {
    removed: ops.filter(o => o.type === 'del').map(o => o.value),
    added: ops.filter(o => o.type === 'add').map(o => o.value),
  };
}

function generateHtmlDiff(beforeHtml, afterHtml) {
  const beforeLines = (beforeHtml || '').split('\n');
  const afterLines = (afterHtml || '').split('\n');

  const { removed: rawRemoved, added: rawAdded } =
    beforeLines.length + afterLines.length > MAX_DIFF_INPUT_LINES
      ? multisetDiff(beforeLines, afterLines)
      : diffOps(beforeLines, afterLines);

  const removed = rawRemoved.filter(l => l.trim());
  const added = rawAdded.filter(l => l.trim());

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
