import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { DocumentChunk, RAGChainInput, RAGChainOutput, CitationSource } from "./types.js";
import { defaultCorpusChunks } from "./corpus.js";
import { createLCELRetrievalPipeline } from "./retrievers.js";
import { createPrimaryAndFallbackModels } from "../models/providers.js";
import { InMemoryMetricsTracer } from "../observability/tracer.js";

export interface StreamingRAGChainOptions {
  chunks?: DocumentChunk[];
  primaryModel?: BaseChatModel;
  fallbackModel?: BaseChatModel;
  tracer?: InMemoryMetricsTracer;
  topK?: number;
}

export class StreamingRAGChain {
  private readonly chunks: DocumentChunk[];
  private readonly primaryModel: BaseChatModel;
  private readonly fallbackModel: BaseChatModel;
  private readonly tracer: InMemoryMetricsTracer;
  private readonly topK: number;
  private readonly retrievalPipeline: ReturnType<typeof createLCELRetrievalPipeline>;
  private readonly prompt: ChatPromptTemplate;

  constructor(options: StreamingRAGChainOptions = {}) {
    this.chunks = options.chunks ?? defaultCorpusChunks;
    const defaultModels = createPrimaryAndFallbackModels();
    this.primaryModel = (options.primaryModel ?? defaultModels.primaryModel) as BaseChatModel;
    this.fallbackModel = (options.fallbackModel ?? defaultModels.fallbackModel) as BaseChatModel;
    this.tracer = options.tracer ?? new InMemoryMetricsTracer();
    this.topK = options.topK ?? 3;

    this.retrievalPipeline = createLCELRetrievalPipeline(this.chunks, { topK: this.topK });

    this.prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are an authoritative enterprise knowledge assistant.
Answer the user's question accurately using ONLY the provided verified context documents.
Strictly adhere to the following rules:
1. Every factual statement must cite its source identifier in square brackets, e.g. [corp-handbook-2026-0].
2. Do not invent details not present in the context.
3. If the context does not contain sufficient information, state that clearly.`,
      ],
      [
        "human",
        `VERIFIED CONTEXT DOCUMENTS:
{context}

USER QUESTION:
{query}

GROUNDED ENTERPRISE ANSWER:`,
      ],
    ]);
  }

  getTracer(): InMemoryMetricsTracer {
    return this.tracer;
  }

  /**
   * Builds the core model generation chain with automatic fallback
   */
  private getGenerationChain() {
    const robustModel = this.primaryModel.withFallbacks({
      fallbacks: [this.fallbackModel],
    });

    return RunnableSequence.from([
      this.prompt,
      robustModel,
      new StringOutputParser(),
    ]);
  }

  /**
   * Retrieves context chunks and citations using the LCEL retrieval DAG
   */
  async retrieveContext(query: string) {
    const start = performance.now();
    const retrievalOutput = await this.retrievalPipeline.invoke(
      { query },
      { callbacks: [this.tracer] }
    );
    const duration = performance.now() - start;

    return {
      retrievalOutput,
      durationMs: Number(duration.toFixed(2)),
    };
  }

  /**
   * Invokes the complete chain, returning the full answer, citations, and metrics
   */
  async invoke(input: RAGChainInput): Promise<RAGChainOutput> {
    const totalStart = performance.now();

    // 1. Retrieval stage
    const { retrievalOutput, durationMs: retrievalDurationMs } = await this.retrieveContext(input.query);

    // 2. Generation stage with fallbacks
    const genChain = this.getGenerationChain();
    const genStart = performance.now();
    let answer = "";
    let usedFallback = false;

    try {
      answer = await genChain.invoke(
        {
          context: retrievalOutput.contextText,
          query: input.query,
        },
        { callbacks: [this.tracer] }
      );
    } catch (err) {
      // If primary threw and fallback caught it inside LCEL
      usedFallback = true;
      throw err;
    }

    const generationDurationMs = Number((performance.now() - genStart).toFixed(2));
    const totalDurationMs = Number((performance.now() - totalStart).toFixed(2));

    return {
      answer,
      sources: retrievalOutput.sources,
      metrics: {
        totalDurationMs,
        retrievalDurationMs,
        generationDurationMs,
        retrievedCount: retrievalOutput.sources.length,
        usedFallback,
      },
    };
  }

  /**
   * Streams generation tokens sequentially through the chain
   */
  async *stream(
    input: RAGChainInput
  ): AsyncGenerator<{ type: "token" | "sources" | "done"; content?: string; sources?: CitationSource[] }> {
    // 1. First retrieve the context
    const { retrievalOutput } = await this.retrieveContext(input.query);

    // Yield sources immediately so client can render citations while tokens stream
    yield {
      type: "sources",
      sources: retrievalOutput.sources,
    };

    // 2. Stream generation tokens through fallback-enabled model
    const genChain = this.getGenerationChain();
    const streamIterator = await genChain.stream(
      {
        context: retrievalOutput.contextText,
        query: input.query,
      },
      { callbacks: [this.tracer] }
    );

    for await (const chunk of streamIterator) {
      if (chunk) {
        yield {
          type: "token",
          content: chunk,
        };
      }
    }

    yield { type: "done" };
  }
}
