import { StreamingRAGChain } from "./rag/chain.js";
import { heldOutQueries } from "./rag/corpus.js";
import { MockChatModel } from "./models/providers.js";
import { InMemoryMetricsTracer } from "./observability/tracer.js";
import { computeRecallAtK, computeMRR, computeNDCGAtK, computeContextPrecision, runBenchmarkComparison, } from "./benchmark/raw-vs-lcel.js";
export async function runDay05Challenge() {
    console.log("=".repeat(80));
    console.log("DAY 05 CODING CHALLENGE: STREAMING LCEL RAG WITH FALLBACKS & TRACING");
    console.log("=".repeat(80));
    const tracer = new InMemoryMetricsTracer();
    // Primary model that succeeds normally
    const primaryModel = new MockChatModel({
        modelName: "primary-gpt-4o",
        tokenDelayMs: 5,
    });
    // Fallback model for failover
    const fallbackModel = new MockChatModel({
        modelName: "fallback-gpt-4o-mini",
        tokenDelayMs: 5,
    });
    const ragChain = new StreamingRAGChain({
        primaryModel,
        fallbackModel,
        tracer,
        topK: 3,
    });
    // ============================================================================
    // Step 1: Retrieval Metrics Evaluation across 5 Held-Out Challenging Queries
    // ============================================================================
    console.log("\n1. Evaluating LCEL Retrieval Accuracy over Held-Out Queries...");
    let totalRecall = 0;
    let totalMRR = 0;
    let totalNDCG = 0;
    let totalPrecision = 0;
    for (const q of heldOutQueries) {
        const { retrievalOutput } = await ragChain.retrieveContext(q.query);
        const retrievedIds = retrievalOutput.retrievedResults.map((r) => r.chunk.id);
        const rec = computeRecallAtK(retrievedIds, q.relevantChunkIds, 3);
        const mrr = computeMRR(retrievedIds, q.relevantChunkIds);
        const ndcg = computeNDCGAtK(retrievedIds, q.relevantChunkIds, 3);
        const prec = computeContextPrecision(retrievedIds, q.relevantChunkIds, 3);
        totalRecall += rec;
        totalMRR += mrr;
        totalNDCG += ndcg;
        totalPrecision += prec;
        console.log(`  [Query: ${q.id}] "${q.query}"`);
        console.log(`    → Target: [${q.relevantChunkIds.join(", ")}] | Top-1 Retrieved: [${retrievedIds[0]}] | Recall@3: ${rec.toFixed(2)} | MRR: ${mrr.toFixed(2)}`);
    }
    const n = heldOutQueries.length;
    const avgRecallAt3 = totalRecall / n;
    const avgMRR = totalMRR / n;
    const avgNDCGAt3 = totalNDCG / n;
    const avgPrecision = totalPrecision / n;
    console.log(`\nLCEL Retrieval Accuracy Summary:`);
    console.log(`  • Avg Recall@3:  ${avgRecallAt3.toFixed(3)} (Pass threshold >= 0.80)`);
    console.log(`  • Avg MRR:       ${avgMRR.toFixed(3)} (Pass threshold >= 0.80)`);
    console.log(`  • Avg nDCG@3:    ${avgNDCGAt3.toFixed(3)}`);
    console.log(`  • Avg Precision: ${avgPrecision.toFixed(3)}`);
    const retrievalParityPass = avgRecallAt3 >= 0.8 && avgMRR >= 0.8;
    // ============================================================================
    // Step 2: Real-time Multi-Step Streaming Token Demonstration
    // ============================================================================
    console.log("\n2. Demonstrating Real-Time Token Streaming through LCEL Pipeline...");
    const streamQuery = "What is the WFH equipment stipend allowance and eligibility?";
    console.log(`  Streaming Response for Query: "${streamQuery}"\n  Answer: `);
    let streamedTokenCount = 0;
    let receivedSources = false;
    for await (const event of ragChain.stream({ query: streamQuery })) {
        if (event.type === "sources" && event.sources) {
            receivedSources = true;
        }
        else if (event.type === "token" && event.content) {
            process.stdout.write(event.content);
            streamedTokenCount++;
        }
    }
    console.log(`\n  [Stream complete: ${streamedTokenCount} tokens received | Sources captured: ${receivedSources}]`);
    const streamingPass = streamedTokenCount > 0 && receivedSources;
    // ============================================================================
    // Step 3: Primary Model Failure & Seamless Fallback Failover
    // ============================================================================
    console.log("\n3. Testing Configurable Fallbacks (.withFallbacks)...");
    const failingPrimaryModel = new MockChatModel({
        modelName: "failing-primary-gpt-4o",
        failAlways: true, // Simulates 429 Rate Limit error
    });
    const resilientFallbackModel = new MockChatModel({
        modelName: "resilient-fallback-gpt-4o-mini",
        tokenDelayMs: 1,
    });
    const fallbackChain = new StreamingRAGChain({
        primaryModel: failingPrimaryModel,
        fallbackModel: resilientFallbackModel,
        tracer,
        topK: 3,
    });
    let fallbackPass = false;
    try {
        const fallbackResponse = await fallbackChain.invoke({
            query: "How many days advance notice must be given for parental leave?",
        });
        console.log(`  ✓ Fallback succeeded without throwing exception!`);
        console.log(`    Primary Model: Failed with simulated RateLimitError (429)`);
        console.log(`    Fallback Model: Successfully answered: "${fallbackResponse.answer.slice(0, 75)}..."`);
        fallbackPass = true;
    }
    catch (err) {
        console.error(`  ✗ Fallback failed:`, err);
    }
    // ============================================================================
    // Step 4: Observability Tracing Spans
    // ============================================================================
    console.log("\n4. Observability & Tracing Spans:");
    tracer.printTraceTree();
    const traceMetrics = tracer.getMetricsSummary();
    console.log(`  Total Recorded Spans: ${traceMetrics.totalSpans} | Tokens Streamed: ${traceMetrics.totalTokens}`);
    // ============================================================================
    // Step 5: Cost and Latency Comparison vs. Raw Day-03 Pipeline
    // ============================================================================
    console.log("\n5. Running Statistical Benchmark (Raw Day-03 vs. LangChain LCEL)...");
    const benchmarkResult = await runBenchmarkComparison(15);
    const allPassed = retrievalParityPass && streamingPass && fallbackPass;
    console.log("\n" + "=".repeat(80));
    console.log(`CHALLENGE VERDICT: ${allPassed ? "PASSED ALL TESTS (100%)" : "FAILED"}`);
    console.log("=".repeat(80) + "\n");
    return {
        success: allPassed,
        retrievalParityPass,
        streamingPass,
        fallbackPass,
        metrics: {
            avgRecallAt3,
            avgMRR,
            avgNDCGAt3,
        },
    };
}
if (process.argv[1]?.includes("challenge")) {
    runDay05Challenge().catch(console.error);
}
