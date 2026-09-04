import { readFileSync } from "node:fs";
import { RunSetWriter } from "../evidence/run-set-writer.js";
import type { VerdictResult } from "../types.js";
import type { CardId, RunId, RunSetId } from "../util/brands.js";
import { makeRunId, makeRunSetId } from "../util/id.js";
import type { RunSetCtx, RunSetKind } from "./run-set-types.js";

export interface ExecutorArgs {
  cardId: CardId;
  runSetCtx: RunSetCtx;
  runId: RunId;
}

export interface ExecutorReturn {
  runId: RunId;
  outDir: string;
  result: VerdictResult;
}

export type Executor = (args: ExecutorArgs) => Promise<ExecutorReturn>;

export interface CancelToken {
  cancelled: boolean;
}

export interface RunSetConfig {
  resultsRoot: string;
  cards: CardId[];
  passes: number;
  kind: RunSetKind;
  executor: Executor;
  generateRunId?: ((cardId: CardId, attemptNumber: number) => RunId) | undefined;
  cancelToken?: CancelToken | undefined;
  onAllRunsKnown?: (runs: Array<{ runId: RunId; cardId: CardId; attemptNumber: number }>) => void;
}

export interface RunSetResult {
  runSetId: RunSetId;
  runs: Array<{ runId: RunId; cardId: CardId; attemptNumber: number; status: string }>;
  summary: {
    perCard: Array<{ cardId: CardId; cardStatus: string; byStatus: Record<string, number> }>;
    overall: { overallStatus: string; byStatus: Record<string, number>; totalRuns: number };
  } | null;
}

export interface RunSetHandle {
  runSetId: RunSetId;
  kind: RunSetKind;
  passes: number;
  cards: CardId[];
  runs: Array<{ runId: RunId; cardId: CardId; attemptNumber: number }>;
  completion: Promise<RunSetResult>;
}

export async function runRunSet(cfg: RunSetConfig): Promise<RunSetHandle> {
  // ── Prep phase (fast: id gen, eager runIds, set.json stub) ──

  // A duplicate cardId makes runLoop's by-value lookup (below) match the
  // same eagerly-generated run entry for two different loop iterations —
  // one attempt gets executed twice under one runId while its sibling is
  // never started, and RunSetWriter's perCard/overall roll-up (which
  // groups `manifest.runs` by cardId) then double-counts every run that
  // shares the id (CR-048). Reject the ambiguity outright rather than
  // silently corrupt the run set. The only caller today, batch.ts,
  // disambiguates its card ids before reaching here (CR-043), so this
  // should never fire in production.
  const seenCardIds = new Set<string>();
  for (const cardId of cfg.cards) {
    if (seenCardIds.has(cardId)) {
      throw new Error(
        `runRunSet: duplicate cardId "${cardId}" in cards[] — card ids must be unique`,
      );
    }
    seenCardIds.add(cardId);
  }

  const runSetId = makeRunSetId(cfg.kind);
  const gen = cfg.generateRunId ?? ((cardId, _i) => makeRunId(cardId));

  // Eagerly generate all runIds so set.json is fully populated up front.
  const allRuns: Array<{ runId: RunId; cardId: CardId; attemptNumber: number }> = [];
  for (const [_cardIndex, cardId] of cfg.cards.entries()) {
    for (let attemptNumber = 1; attemptNumber <= cfg.passes; attemptNumber++) {
      allRuns.push({
        runId: gen(cardId, attemptNumber),
        cardId,
        attemptNumber,
      });
    }
  }

  const ctx0: RunSetCtx = {
    runSetId,
    kind: cfg.kind,
    passes: cfg.passes,
    cards: cfg.cards,
    cardIndex: 0,
    attemptNumber: 1,
  };
  const writer = new RunSetWriter(cfg.resultsRoot, ctx0);
  writer.start(allRuns);
  cfg.onAllRunsKnown?.(allRuns);

  // ── Run phase (slow: cards × passes loop). Started but not awaited. ──
  const completion = runLoop({ cfg, writer, ctx0, allRuns, runSetId });

  return {
    runSetId,
    kind: cfg.kind,
    passes: cfg.passes,
    cards: cfg.cards,
    runs: allRuns,
    completion,
  };
}

async function runLoop(args: {
  cfg: RunSetConfig;
  writer: RunSetWriter;
  ctx0: RunSetCtx;
  allRuns: Array<{ runId: RunId; cardId: CardId; attemptNumber: number }>;
  runSetId: RunSetId;
}): Promise<RunSetResult> {
  const { cfg, writer, ctx0, allRuns, runSetId } = args;

  const resultsByRunId = new Map<string, VerdictResult>();
  const processedRunIds = new Set<string>();

  outer: for (const [cardIndex, cardId] of cfg.cards.entries()) {
    for (let attemptNumber = 1; attemptNumber <= cfg.passes; attemptNumber++) {
      if (cfg.cancelToken?.cancelled) break outer;

      const runEntry = allRuns.find(
        (r) => r.cardId === cardId && r.attemptNumber === attemptNumber,
      );
      if (runEntry === undefined) {
        // allRuns is generated from the same (cards x passes) product in the
        // prep phase, so this cannot happen. Upstream asserted it with `!`;
        // saying it out loud is cheaper than a silent skip.
        throw new Error(
          `runRunSet: no eagerly-generated run for card ${cardId} attempt ${attemptNumber}`,
        );
      }
      const ctx: RunSetCtx = { ...ctx0, cardIndex, attemptNumber };

      writer.recordRunStart(runEntry.runId);
      processedRunIds.add(runEntry.runId);
      try {
        const ret = await cfg.executor({
          cardId,
          runSetCtx: ctx,
          runId: runEntry.runId,
        });
        resultsByRunId.set(runEntry.runId, ret.result);
        writer.recordRunEnd(runEntry.runId, ret.result.status);
      } catch (e) {
        // The executor threw before producing a result — record the run as
        // errored, but don't let the exception vanish. Without this, an
        // errored run in set.json carries zero information about why: no
        // message, no stack, nothing on stdout/stderr either.
        console.error(`runRunSet: executor failed for run ${runEntry.runId}:`, e);
        writer.recordRunEnd(runEntry.runId, "errored");
      }
    }
  }

  // Anything we never started is `cancelled`.
  if (cfg.cancelToken?.cancelled) {
    for (const r of allRuns) {
      if (!processedRunIds.has(r.runId)) {
        writer.recordRunEnd(r.runId, "cancelled");
      }
    }
  }

  writer.finalize((runId) => resultsByRunId.get(runId) ?? null);

  // Re-read final manifest.
  const set = JSON.parse(readFileSync(`${cfg.resultsRoot}/run-sets/${runSetId}/set.json`, "utf8"));
  return { runSetId, runs: set.runs, summary: set.summary };
}
