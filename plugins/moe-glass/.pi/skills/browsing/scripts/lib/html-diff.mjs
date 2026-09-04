const MAX_LINES_PER_SIDE = 50;
const MAX_LINE_LENGTH = 200;

const MAX_DIFFABLE_LINES_PER_SIDE = 2000;

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

export { generateHtmlDiff };
