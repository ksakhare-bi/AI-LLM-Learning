import { LLMClient } from "./llm/client.js";
import { OpenAIProvider } from "./llm/providers/openai.provider.js";
import { GeminiProvider } from "./llm/providers/gemini.provider.js";
import { AnthropicProvider } from "./llm/providers/anthropic.provider.js";
import { ProviderRouter } from "./llm/provider-router.js";
import { MemoryLLMCache } from "./llm/cache/memory-cache.js";
import { LLMBudget } from "./llm/budget.js";
import { ConsoleObserver } from "./llm/observability/console-observer.js";
import { MetricsCollector } from "./llm/observability/metrics-collector.js";
import { ToolRegistry } from "./llm/tools/tool-registry.js";
import { LeadSchema } from "./llm/validation.js";
import { z } from "zod";
async function main() {
    console.log("================================================================================");
    console.log("            DAY 01: LLM SYSTEMS GATEWAY - UNIFIED ARCHITECTURE DEMO             ");
    console.log("================================================================================\n");
    // 1. Adapters & Fallback Router
    const openai = new OpenAIProvider();
    const gemini = new GeminiProvider();
    const anthropic = new AnthropicProvider();
    const router = new ProviderRouter([
        { name: "openai", provider: openai },
        { name: "gemini", provider: gemini },
        { name: "anthropic", provider: anthropic }
    ], { failureThreshold: 3, cooldownMs: 1000 });
    // 2. Exact-Match Cache
    const cache = new MemoryLLMCache();
    // 3. Budget Guard
    const budget = new LLMBudget({ maxBudgetUsd: 0.10 });
    // 4. Observability Observers
    const consoleObserver = new ConsoleObserver();
    const metrics = new MetricsCollector();
    // 5. Tool Registry
    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
        name: "get_customer",
        description: "Fetch customer details by customer ID",
        schema: z.object({ customerId: z.string() }),
        getDefinition() {
            return {
                name: this.name,
                description: this.description,
                parameters: {
                    type: "object",
                    properties: { customerId: { type: "string" } },
                    required: ["customerId"]
                }
            };
        },
        async execute(args) {
            return {
                id: args.customerId,
                name: "Acme Enterprise Corp",
                tier: "Platinum",
                balance: "$4,500.00"
            };
        }
    });
    // 6. LLM Gateway Client
    const client = new LLMClient({
        provider: router,
        timeoutMs: 3000,
        totalTimeoutMs: 5000,
        budget,
        cache,
        observers: [consoleObserver, metrics]
    });
    // ---------------------------------------------------------------------------
    // DEMO 1: Standard Generation (Cold Cache)
    // ---------------------------------------------------------------------------
    console.log(">>> [1] Sending First Request (Cold Cache)...");
    const response1 = await client.generate({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello, who are you?" }]
    });
    console.log("Result 1:", response1.content);
    console.log(`Cached: ${response1.cached} | Cost: $${response1.cost?.totalTokensCost.toFixed(6)}\n`);
    // ---------------------------------------------------------------------------
    // DEMO 2: Cache Hit Verification
    // ---------------------------------------------------------------------------
    console.log(">>> [2] Sending Identical Request (Exact-Match Cache Hit expected)...");
    const response2 = await client.generate({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello, who are you?" }]
    });
    console.log("Result 2:", response2.content);
    console.log(`Cached: ${response2.cached} (Bypassed network, cost $0.00!)\n`);
    // ---------------------------------------------------------------------------
    // DEMO 3: Structured Output & Schema Validation
    // ---------------------------------------------------------------------------
    console.log(">>> [3] Structured Output with Schema Validation...");
    const lead = await client.generateStructured({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Extract lead data for Alice" }]
    }, LeadSchema);
    console.log("Parsed & Validated Lead Object:", lead, "\n");
    // ---------------------------------------------------------------------------
    // DEMO 4: Tool / Function Calling & Execution
    // ---------------------------------------------------------------------------
    console.log(">>> [4] Tool Calling via Trusted Tool Layer...");
    const toolResponse = await client.generate({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Look up customer account details" }],
        tools: toolRegistry.getDefinitions()
    });
    console.log("LLM Requested Tool Calls:", toolResponse.toolCalls);
    const toolResults = await client.executeTools(toolResponse, toolRegistry);
    console.log("Trusted Tool Execution Results:", toolResults, "\n");
    // ---------------------------------------------------------------------------
    // DEMO 5: Budget and Observability Snapshot
    // ---------------------------------------------------------------------------
    console.log(">>> [5] Observability & Budget Summary:");
    const snapshot = metrics.getSnapshot();
    console.log(`Total Gateway Requests: ${snapshot.totalRequests}`);
    console.log(`Cache Hits:             ${snapshot.cacheHits} (${(snapshot.cacheHitRatio * 100).toFixed(0)}%)`);
    console.log(`Total Tokens:           ${snapshot.totalTokens}`);
    console.log(`Total Spend:            $${budget.getSpent().toFixed(6)} USD`);
    console.log(`Remaining Budget:       $${budget.getRemaining().toFixed(6)} USD`);
    console.log("================================================================================");
}
main().catch((err) => {
    console.error("Gateway execution error:", err);
});
