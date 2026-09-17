import { MockChatModel } from "../src/models/providers.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { StreamingRAGChain } from "../src/rag/chain.js";

async function testStreaming() {
  console.log("Testing token streaming through multi-step LCEL chains...");

  // 1. Direct LLM streaming
  const mockModel = new MockChatModel({ tokenDelayMs: 1 });
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a test assistant."],
    ["human", "{input}"],
  ]);

  const chain = prompt.pipe(mockModel).pipe(new StringOutputParser());

  const tokens: string[] = [];
  for await (const chunk of await chain.stream({ input: "parental leave" })) {
    tokens.push(chunk);
  }

  if (tokens.length < 5) {
    throw new Error(`Expected at least 5 stream chunks, got ${tokens.length}`);
  }

  const fullAnswer = tokens.join("");
  if (!fullAnswer.includes("parental leave")) {
    throw new Error(`Stream output missing expected keywords: ${fullAnswer}`);
  }

  // 2. Full StreamingRAGChain streaming
  const ragChain = new StreamingRAGChain({
    primaryModel: mockModel,
    topK: 3,
  });

  let receivedSources = false;
  const ragTokens: string[] = [];

  for await (const event of ragChain.stream({ query: "What is the travel per diem rate?" })) {
    if (event.type === "sources") {
      receivedSources = true;
      if (!event.sources || event.sources.length === 0) {
        throw new Error("Expected non-empty sources list from stream");
      }
    } else if (event.type === "token" && event.content) {
      ragTokens.push(event.content);
    }
  }

  if (!receivedSources) {
    throw new Error("Stream did not emit sources event");
  }

  if (ragTokens.length === 0) {
    throw new Error("Stream did not emit any token chunks");
  }

  console.log(`✓ Streaming tests passed (${tokens.length} raw tokens, ${ragTokens.length} RAG tokens)!`);
}

testStreaming().catch((err) => {
  console.error("test/streaming.test.ts failed:", err);
  process.exit(1);
});
