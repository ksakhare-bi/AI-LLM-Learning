import { StructureAwareChunker } from "./ingestion/chunker.js";
import type { SourceDocument } from "./ingestion/types.js";
import { DenseRetriever } from "./retrieval/dense-retriever.js";
import { BM25Retriever } from "./retrieval/sparse-retriever.js";
import { HybridRetriever } from "./retrieval/hybrid-retriever.js";
import { TwoStageRetriever } from "./retrieval/two-stage-retriever.js";
import { CrossEncoderReranker } from "./retrieval/reranker.js";
import { QueryRewriter } from "./transformation/rewriter.js";
import type { LabeledQuery, BenchmarkSummary } from "./eval/types.js";
import { evaluateRetrieval } from "./eval/metrics.js";

// ============================================================================
// 1. Enterprise Corpus Definition
// ============================================================================
export const enterpriseCorpus: SourceDocument = {
  id: "corp-handbook-2026",
  title: "Enterprise Policies and Technical SOPs",
  sections: [
    {
      heading: "Parental Leave & Family Support",
      content:
        "Employees are eligible for 26 weeks of fully paid parental leave. " +
        "Employees must provide formal written notification to their direct manager at least 30 days prior to the expected leave date. " +
        "Leave applies equally to primary and secondary caregivers.",
      metadata: { section: "Parental Leave & Family Support", version: 1 },
    },
    {
      heading: "Annual Vacation & Leave Rollover",
      content:
        "Full-time staff receive 20 annual leave days per fiscal year. " +
        "A maximum of 5 unused leave days can be carried over into the following year. " +
        "Any accumulated leave exceeding the 5-day rollover threshold is permanently forfeited on December 31st.",
      metadata: { section: "Annual Vacation & Leave Rollover", version: 1 },
    },
    {
      heading: "Remote Work & Home Office Equipment Subsidy",
      content:
        "Employees approved for telecommuting may work remotely up to three days per calendar week. " +
        "A one-time home office equipment subsidy of $750 is provided for remote ergonomics, desks, and monitors. " +
        "Remote work schedules require quarterly operational manager approval.",
      metadata: { section: "Remote Work & Home Office Equipment Subsidy", version: 1 },
    },
    {
      heading: "Security Authentication & Credentials Standard",
      content:
        "All engineers and staff must enforce hardware token multi-factor authentication (MFA). " +
        "Company access credentials must never be shared under any circumstances. " +
        "Any suspected credential leakage triggers immediate incident ERR_AUTH_MFA_092 and credential revocation.",
      metadata: { section: "Security Authentication & Credentials Standard", version: 1 },
    },
    {
      heading: "Travel Per-Diem & Expense Reimbursement 2026",
      content:
        "Effective January 2026, the domestic business travel per-diem allowance is updated to $95 per day. " +
        "The legacy 2024 per-diem rate of $65 per day is completely deprecated and void. " +
        "Receipts must be submitted within 14 calendar days of travel completion.",
      metadata: { section: "Travel Per-Diem & Expense Reimbursement 2026", version: 2 },
    },
  ],
};

// ============================================================================
// 2. Held-Out Challenging Labeled Evaluation Queries
// ============================================================================
export const heldOutQueries: LabeledQuery[] = [
  {
    id: "eval-01",
    query: "What is the WFH equipment stipend allowance?",
    relevantChunkIds: ["corp-handbook-2026-2"], // Home Office Equipment Subsidy
    notes: "Acronym/synonym challenge: 'WFH equipment stipend' -> 'Remote Home Office Equipment Subsidy'",
  },
  {
    id: "eval-02",
    query: "How many days advance notice must be given for parental leave and how many weeks?",
    relevantChunkIds: ["corp-handbook-2026-0"], // Parental leave
    notes: "Multi-constraint numerical check: 30 days notice + 26 weeks",
  },
  {
    id: "eval-03",
    query: "What happens during ERR_AUTH_MFA_092 credential leakage?",
    relevantChunkIds: ["corp-handbook-2026-5"], // Security incident ERR_AUTH_MFA_092
    notes: "Exact error code matching: ERR_AUTH_MFA_092",
  },
  {
    id: "eval-04",
    query: "What are the rules on leave carryover and forfeiture?",
    relevantChunkIds: ["corp-handbook-2026-1"], // Annual leave rollover forfeiture
    notes: "Distinguishes rollover forfeiture vs parental leave",
  },
  {
    id: "eval-05",
    query: "What is the active 2026 travel per-diem reimbursement rate?",
    relevantChunkIds: ["corp-handbook-2026-6"], // Travel per diem 2026
    notes: "Temporal versioning: 2026 ($95) vs deprecated 2024 ($65)",
  },
];

export async function runChallengeBenchmark(): Promise<{
  naive: BenchmarkSummary;
  hybrid: BenchmarkSummary;
  twoStage: BenchmarkSummary;
}> {
  console.log("=".repeat(80));
  console.log("DAY 03 CODING CHALLENGE: MEASURABLE RETRIEVAL QUALITY LIFT AT SCALE");
  console.log("=".repeat(80));

  // Chunking the corpus
  const chunker = new StructureAwareChunker({ maxCharacters: 250 });
  const chunks = chunker.chunk(enterpriseCorpus);
  console.log(`\nIndexed Corpus: ${chunks.length} structure-aware chunks across 5 sections:`);
  chunks.forEach((c) => console.log(`  - [${c.id}] (${c.metadata.section}): ${c.content.slice(0, 70)}...`));
  console.log();

  // Setting up the three candidate pipelines
  const naiveRetriever = new DenseRetriever(chunks);
  const sparseRetriever = new BM25Retriever(chunks);
  const hybridRetriever = new HybridRetriever(naiveRetriever, sparseRetriever, {
    fusionMethod: "rrf",
    rrfConstant: 60,
    candidatePoolSize: 10,
  });
  const rewriter = new QueryRewriter();
  const reranker = new CrossEncoderReranker();
  const twoStageRetriever = new TwoStageRetriever(hybridRetriever, {
    stage1Limit: 10,
    reranker,
  });

  const pipelines = [
    {
      name: "Naive Dense Top-K",
      search: (q: string, k: number) => naiveRetriever.search(q, k),
    },
    {
      name: "Hybrid Search (Dense + BM25 + RRF)",
      search: (q: string, k: number) => hybridRetriever.search(q, k),
    },
    {
      name: "Advanced (Rewrite + Hybrid + Re-Rank)",
      search: (q: string, k: number) => {
        const transformedQuery = rewriter.rewrite(q);
        return twoStageRetriever.search(transformedQuery, k);
      },
    },
  ];

  const summaries: Record<string, BenchmarkSummary> = {};
  const K = 3;

  for (const pipeline of pipelines) {
    const start = performance.now();
    let totalRecall = 0;
    let totalMRR = 0;
    let totalNDCG = 0;
    let totalPrecision = 0;

    for (const query of heldOutQueries) {
      const retrieved = pipeline.search(query.query, K);
      const evalResult = evaluateRetrieval(retrieved, query, K);
      totalRecall += evalResult.metrics.recallAtK;
      totalMRR += evalResult.metrics.mrr;
      totalNDCG += evalResult.metrics.ndcgAtK;
      totalPrecision += evalResult.metrics.contextPrecision;
    }

    const elapsed = performance.now() - start;
    const n = heldOutQueries.length;

    summaries[pipeline.name] = {
      configName: pipeline.name,
      k: K,
      queryCount: n,
      avgRecallAtK: totalRecall / n,
      avgMRR: totalMRR / n,
      avgNDCGAtK: totalNDCG / n,
      avgContextPrecision: totalPrecision / n,
      avgLatencyMs: elapsed / n,
    };
  }

  // Print comparison table
  console.log("┌────────────────────────────────────────┬───────────┬──────────┬──────────┬───────────┐");
  console.log("│ Pipeline Configuration                 │ Recall@3  │ MRR      │ nDCG@3   │ Precision │");
  console.log("├────────────────────────────────────────┼───────────┼──────────┼──────────┼───────────┤");
  for (const s of Object.values(summaries)) {
    const name = s.configName.padEnd(38, " ");
    const rec = s.avgRecallAtK.toFixed(3).padStart(9, " ");
    const mrr = s.avgMRR.toFixed(3).padStart(8, " ");
    const ndcg = s.avgNDCGAtK.toFixed(3).padStart(8, " ");
    const prec = s.avgContextPrecision.toFixed(3).padStart(9, " ");
    console.log(`│ ${name} │ ${rec} │ ${mrr} │ ${ndcg} │ ${prec} │`);
  }
  console.log("└────────────────────────────────────────┴───────────┴──────────┴──────────┴───────────┘");

  const naive = summaries["Naive Dense Top-K"];
  const hybrid = summaries["Hybrid Search (Dense + BM25 + RRF)"];
  const advanced = summaries["Advanced (Rewrite + Hybrid + Re-Rank)"];

  const recallLift = ((advanced.avgRecallAtK - naive.avgRecallAtK) / (naive.avgRecallAtK || 1)) * 100;
  const mrrLift = ((advanced.avgMRR - naive.avgMRR) / (naive.avgMRR || 1)) * 100;

  console.log(`\nQuantitative Improvement Summary:`);
  console.log(`  • Recall@3: ${naive.avgRecallAtK.toFixed(3)} → ${advanced.avgRecallAtK.toFixed(3)} (${recallLift >= 0 ? "+" : ""}${recallLift.toFixed(1)}%)`);
  console.log(`  • MRR:      ${naive.avgMRR.toFixed(3)} → ${advanced.avgMRR.toFixed(3)} (${mrrLift >= 0 ? "+" : ""}${mrrLift.toFixed(1)}%)`);
  console.log(`\nProven by numbers, not vibes!\n`);

  return { naive, hybrid, twoStage: advanced };
}

if (process.argv[1]?.includes("challenge")) {
  runChallengeBenchmark().catch(console.error);
}
