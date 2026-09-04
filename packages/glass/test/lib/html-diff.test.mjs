import { describe, it } from 'vitest';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { generateHtmlDiff } = require('../../skills/browsing/lib/html-diff.js');

describe('generateHtmlDiff', () => {
  it('returns "(no changes detected)" for identical input', () => {
    const html = '<div>hello</div>\n<div>world</div>';
    assert.equal(generateHtmlDiff(html, html), '(no changes detected)');
  });

  it('shows pure additions in ADDED section only', () => {
    const before = '<p>a</p>';
    const after = '<p>a</p>\n<p>b</p>';
    const diff = generateHtmlDiff(before, after);
    assert.match(diff, /=== ADDED ===/);
    assert.match(diff, /\+ <p>b<\/p>/);
    assert.doesNotMatch(diff, /=== REMOVED ===/);
  });

  it('shows pure removals in REMOVED section only', () => {
    const before = '<p>a</p>\n<p>b</p>';
    const after = '<p>a</p>';
    const diff = generateHtmlDiff(before, after);
    assert.match(diff, /=== REMOVED ===/);
    assert.match(diff, /- <p>b<\/p>/);
    assert.doesNotMatch(diff, /=== ADDED ===/);
  });

  it('detects reorderings of identical lines (Myers)', () => {
    // The bug-fix case: set-based logic returned "no changes" for this.
    const before = '<p>first</p>\n<p>second</p>';
    const after = '<p>second</p>\n<p>first</p>';
    const diff = generateHtmlDiff(before, after);
    assert.notEqual(diff, '(no changes detected)');
  });

  it('caps each side at 50 lines with "and N more" footer', () => {
    const before = '';
    const after = Array.from({ length: 200 }, (_, i) => `<p>line ${i}</p>`).join('\n');
    const diff = generateHtmlDiff(before, after);
    const addedLines = diff.split('\n').filter(l => l.startsWith('+ '));
    assert.equal(addedLines.length, 50);
    assert.match(diff, /and 150 more added lines/);
  });

  it('handles null/empty input', () => {
    assert.equal(generateHtmlDiff(null, null), '(no changes detected)');
    assert.equal(generateHtmlDiff('', ''), '(no changes detected)');
  });

  // CR-059 / CR-060: myersDiff's `trace` snapshots its full O(N+M)-wide `v`
  // array on every edit-distance step, so memory is O(D*(N+M)) with D
  // unbounded (two completely different documents make D = N+M). Two
  // ordinary, moderately large pages that differ on every line can exhaust
  // the process heap — a hard V8 abort, not a catchable exception — with no
  // cap anywhere in the call chain. This uses a size well below the
  // measured-unsafe range (thousands of fully-differing lines already cost
  // hundreds of MB per the findings' own repro tables) so the test stays
  // cheap and safe to run on a shared machine; the point under test is that
  // a cap/bail-out exists at all, not the exact crash threshold.
  it('bails out to a cheap summary instead of running Myers above a line-count safety cap', () => {
    const N = 2200; // comfortably over any reasonable "a few thousand" cap floor
    const before = Array.from({ length: N }, (_, i) => `before-line-${i}`).join('\n');
    const after = Array.from({ length: N }, (_, i) => `after-line-${i}`).join('\n'); // every line differs: worst case for edit distance
    const diff = generateHtmlDiff(before, after);

    // A full Myers diff at this size would enumerate every one of the N
    // differing lines under these markers — exactly the per-line, O(N+M)
    // work the cap exists to skip.
    assert.doesNotMatch(diff, /=== REMOVED ===/);
    assert.doesNotMatch(diff, /=== ADDED ===/);
    assert.match(diff, new RegExp(String(N)), 'summary should report the (large) line counts');
    assert.match(diff, /too large to diff/i);
  });

  it('still reports "(no changes detected)" for identical oversized input (cheap equality check, no diff needed)', () => {
    const big = Array.from({ length: 2200 }, (_, i) => `line-${i}`).join('\n');
    assert.equal(generateHtmlDiff(big, big), '(no changes detected)');
  });

  // CR-049: the old 2000-line/side cap still let a single fully-dissimilar
  // diff run the quadratic-memory Myers path and allocate ~250MB — well
  // into "can OOM-kill the server under a constrained container" territory.
  // The cap must be low enough that this exact case (proven in the review's
  // own repro) takes the cheap O(N+M) summary path instead of ever entering
  // myersDiff.
  it('bails out to the cheap summary for a 2000-line/side fully-dissimilar diff (no longer runs full Myers)', () => {
    const N = 2000;
    const before = Array.from({ length: N }, (_, i) => `before-line-${i}`).join('\n');
    const after = Array.from({ length: N }, (_, i) => `after-line-${i}`).join('\n');
    const diff = generateHtmlDiff(before, after);
    assert.match(diff, /too large to diff/i, 'a 2000-line/side diff must no longer run the full Myers algorithm');
  });

  // Direct memory measurement, matching the review's own repro methodology:
  // a full-cap, fully-dissimilar diff (the worst case for Myers' O(D*(N+M))
  // trace-snapshot memory) must stay well under the ~250MB the old 2000-line
  // cap allowed for a single call. Generous threshold to absorb GC/measurement
  // noise while still catching a cap that regresses back toward the old value.
  it('keeps worst-case memory for a full-cap diff far below the old ~250MB (CR-049)', () => {
    const before = Array.from({ length: 300 }, (_, i) => `AAAA${i}`).join('\n');
    const after = Array.from({ length: 300 }, (_, i) => `BBBB${i}`).join('\n');
    if (global.gc) global.gc();
    const before0 = process.memoryUsage().heapUsed;
    generateHtmlDiff(before, after);
    const deltaMB = (process.memoryUsage().heapUsed - before0) / 1024 / 1024;
    assert.ok(deltaMB < 50, `expected a single full-cap diff call to allocate well under 50MB, got ${deltaMB.toFixed(1)}MB`);
  });
});
