// Type declaration for the one export codex-e2e-cleanup.test.ts imports.
// codex-e2e.js itself stays plain JS and outside tsconfig.tests.json's
// "test/manual/**" exclude is deliberate (it needs a real Codex login and
// must never run under the normal test suite) — this file exists only so
// that import doesn't collapse to implicit `any` under the strict test
// project.
export function withTempRoot<T>(
  prefix: string,
  fn: (root: string) => Promise<T>,
): Promise<T>;
