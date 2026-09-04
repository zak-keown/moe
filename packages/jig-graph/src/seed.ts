import type { GraphResult, MoedexClient } from "./moedex.js";

export interface SeedOpts {
  entry?: string;
}

interface FileCluster {
  files: string[];
  score: number;
}

function clusterByCoupling(
  results: GraphResult[],
  consumers: Map<string, Set<string>>,
): FileCluster[] {
  const clusters: FileCluster[] = [];
  const assigned = new Set<string>();

  // Sort by score descending — process highest-impact files first.
  const sorted = [...results].filter((r) => r.score >= 0.5).sort((a, b) => b.score - a.score);

  for (const r of sorted) {
    if (assigned.has(r.rel_path)) continue;

    const cluster: string[] = [r.rel_path];
    assigned.add(r.rel_path);

    // Pull in tightly coupled files (consumer score >= 0.7).
    const deps = consumers.get(r.rel_path) ?? new Set();
    for (const dep of deps) {
      if (!assigned.has(dep)) {
        cluster.push(dep);
        assigned.add(dep);
      }
    }

    clusters.push({ files: cluster, score: r.score });
  }

  return clusters;
}

export async function seedPlanSkeleton(
  topic: string,
  client: MoedexClient,
  opts: SeedOpts = {},
): Promise<string> {
  // Step 1: Find the blast radius.
  const impact = opts.entry
    ? await client.impactAnalysis(opts.entry)
    : await client.searchContext(topic);

  // Step 2: Map coupling between files.
  const consumers = new Map<string, Set<string>>();
  for (const r of impact.results) {
    if (r.score < 0.5) continue;
    const result = await client.traceConsumers([r.rel_path]);
    const coupled = new Set(result.results.filter((c) => c.score >= 0.7).map((c) => c.rel_path));
    consumers.set(r.rel_path, coupled);
  }

  // Step 3: Cluster into task groups.
  const clusters = clusterByCoupling(impact.results, consumers);

  // Step 4: Build depends_on edges between clusters.
  // A cluster B depends on cluster A if any file in B consumes a file in A.
  // `consumers.get(f)` holds the files that *consume* `f` (i.e. depend on
  // it), so to test "does B consume A" we look at A's files' consumers and
  // check whether any of them lands in B — not the reverse.
  const clusterDeps = new Map<number, number[]>();
  for (let i = 0; i < clusters.length; i++) {
    const deps: number[] = [];
    for (let j = 0; j < clusters.length; j++) {
      if (i === j) continue;
      const bFiles = new Set(clusters[i]!.files);
      const bConsumesA = clusters[j]!.files.some((f) => {
        const fConsumers = consumers.get(f) ?? new Set();
        return [...fConsumers].some((c) => bFiles.has(c));
      });
      if (bConsumesA) deps.push(j + 1);
    }
    clusterDeps.set(i + 1, deps);
  }

  // Step 5: Emit markdown.
  const lines: string[] = [];
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]!;
    const taskNum = i + 1;
    const deps = clusterDeps.get(taskNum) ?? [];

    lines.push(`### Task ${taskNum}: [TODO: name]`);
    lines.push("");
    lines.push(`**depends_on:** [${deps.join(", ")}]`);
    lines.push("");
    lines.push("**Files:**");
    for (const f of cluster.files) {
      lines.push(`- Modify: \`${f}\``);
    }
    lines.push("");
    lines.push("**Interfaces:**");
    lines.push("- Consumes: [TODO]");
    lines.push("- Produces: [TODO]");
    lines.push("");
    lines.push("- [ ] **Step 1: [TODO]**");
    lines.push("");
  }

  return lines.join("\n");
}
