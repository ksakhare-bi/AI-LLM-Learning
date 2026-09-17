import "dotenv/config";
import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableLambda, RunnableParallel, RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";
import { MockChatModel } from "./models/providers.js";
import { RetryableStructuredParser } from "./parsers/structured-parser.js";
import { StreamingRAGChain } from "./rag/chain.js";
import { InMemoryMetricsTracer } from "./observability/tracer.js";
import { runBenchmarkComparison } from "./benchmark/raw-vs-lcel.js";

async function main() {
  console.log("================================================================================");
  console.log("DAY 05: LANGCHAIN IN DEPTH (AND ITS LIMITS) - MASTER SHOWCASE");
  console.log("================================================================================\n");

  // ============================================================================
  // DEMO 1: LCEL Internals - Parallelism, Custom Runnables, Typed I/O
  // ============================================================================
  console.log("--- 1. LCEL Composition & Parallel Fan-Out (RunnableParallel) ---");

  // Schema for typed input
  const UserQuerySchema = z.object({
    topic: z.string().min(2),
    urgency: z.enum(["low", "medium", "high"]).default("medium"),
  });

  // Custom RunnableLambda steps
  const sentimentAnalyzer = RunnableLambda.from(async (input: { topic: string }) => {
    // Simulates quick parallel text analysis
    return input.topic.toLowerCase().includes("urgent") || input.topic.toLowerCase().includes("error")
      ? "critical"
      : "standard";
  }).withConfig({ runName: "SentimentAnalyzer" });

  const keywordExtractor = RunnableLambda.from(async (input: { topic: string }) => {
    return input.topic.split(" ").filter((w) => w.length > 3);
  }).withConfig({ runName: "KeywordExtractor" });

  // Parallel fan-out
  const parallelAnalysis = RunnableParallel.from({
    original: new RunnablePassthrough(),
    sentiment: sentimentAnalyzer,
    keywords: keywordExtractor,
  });

  const analysisResult = await parallelAnalysis.invoke({ topic: "Authentication token error in production" });
  console.log("Parallel Analysis Result:", JSON.stringify(analysisResult, null, 2));

  // ============================================================================
  // DEMO 2: Structured Output with Auto-Repair Retries
  // ============================================================================
  console.log("\n--- 2. Structured Output Parser with Auto-Repair Retries ---");

  const FeatureSchema = z.object({
    featureName: z.string(),
    complexity: z.enum(["low", "medium", "high"]),
    tags: z.array(z.string()),
  });

  const structuredParser = new RetryableStructuredParser(FeatureSchema, { maxRetries: 2 });
  const parserRunnable = structuredParser.toRunnable();

  // Test parsing messy, corrupted JSON (with markdown fences and trailing commas)
  const corruptedLLMOutput = `Here is your structured JSON:
\`\`\`json
{
  'featureName': 'Two-Factor Authentication',
  'complexity': 'medium',
  'tags': ['security', 'compliance', 'mfa', ],
}
\`\`\`
Hope this helps!`;

  const parsedFeature = await parserRunnable.invoke(corruptedLLMOutput);
  console.log("Successfully Repaired & Validated Structured Object:", parsedFeature);

  // ============================================================================
  // DEMO 3: Configurable Fallbacks (.withFallbacks)
  // ============================================================================
  console.log("\n--- 3. Configurable Model Fallbacks in Action ---");

  const failingModel = new MockChatModel({
    modelName: "primary-gpt-4o-failing",
    failAlways: true,
  });

  const backupModel = new MockChatModel({
    modelName: "backup-gpt-4o-mini-working",
    tokenDelayMs: 1,
  });

  const resilientModel = failingModel.withFallbacks({
    fallbacks: [backupModel],
  });

  const fallbackChain = ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful assistant."],
    ["human", "{input}"],
  ])
    .pipe(resilientModel)
    .pipe(new StringOutputParser());

  console.log("Invoking chain with failing primary model...");
  const fallbackResult = await fallbackChain.invoke({ input: "Explain LCEL fallbacks" });
  console.log(`✓ Result via Fallback: "${fallbackResult.slice(0, 80)}..."`);

  // ============================================================================
  // DEMO 4: Day-03 Hybrid RAG Rebuilt in LCEL with Streaming & Citations
  // ============================================================================
  console.log("\n--- 4. Traced Streaming Hybrid RAG Pipeline (Rebuilding Day-03) ---");

  const tracer = new InMemoryMetricsTracer();
  const ragChain = new StreamingRAGChain({ tracer, topK: 3 });

  const query = "What are the rules regarding annual leave carryover and forfeiture?";
  console.log(`Query: "${query}"\nStreaming Tokens: `);

  for await (const event of ragChain.stream({ query })) {
    if (event.type === "token" && event.content) {
      process.stdout.write(event.content);
    } else if (event.type === "sources" && event.sources) {
      console.log(`\n\n[Cited Sources (${event.sources.length} chunks retrieved)]:`);
      event.sources.forEach((s, idx) => {
        console.log(`  [${idx + 1}] ID: ${s.id} | Section: ${s.section} | Score: ${s.relevanceScore}`);
      });
      console.log("\nGenerated Answer: ");
    }
  }

  console.log("\n\n--- Observability Spans Recorded ---");
  tracer.printTraceTree();

  // ============================================================================
  // DEMO 5: Quantitative Benchmark: Raw Day-03 vs. LangChain LCEL
  // ============================================================================
  console.log("\n--- 5. Empirical Benchmark: Raw Day-03 vs. LangChain LCEL ---");
  await runBenchmarkComparison(10);

  console.log("================================================================================");
  console.log("Day 05 Showcase Completed Successfully!");
  console.log("================================================================================");
}

main().catch(console.error);