import { MockChatModel } from "../src/models/providers.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

async function testFallbacks() {
  console.log("Testing configurable fallbacks (.withFallbacks)...");

  // Primary model set to always fail with 429
  const primaryModel = new MockChatModel({
    modelName: "failing-primary",
    failAlways: true,
  });

  // Fallback model set to succeed
  const fallbackModel = new MockChatModel({
    modelName: "healthy-fallback",
    tokenDelayMs: 1,
  });

  const resilientModel = primaryModel.withFallbacks({
    fallbacks: [fallbackModel],
  });

  const chain = ChatPromptTemplate.fromMessages([
    ["system", "You are a test assistant."],
    ["human", "{query}"],
  ])
    .pipe(resilientModel)
    .pipe(new StringOutputParser());

  // Should succeed via fallback model
  const response = await chain.invoke({ query: "Test query" });

  if (!response || response.length === 0) {
    throw new Error("Fallback did not return any response");
  }

  if (primaryModel.getInvocationCount() !== 1) {
    throw new Error(`Primary model was expected to be called 1 time, got ${primaryModel.getInvocationCount()}`);
  }

  if (fallbackModel.getInvocationCount() !== 1) {
    throw new Error(`Fallback model was expected to be called 1 time, got ${fallbackModel.getInvocationCount()}`);
  }

  console.log("✓ Fallback failover test passed successfully!");
}

testFallbacks().catch((err) => {
  console.error("test/fallback.test.ts failed:", err);
  process.exit(1);
});
