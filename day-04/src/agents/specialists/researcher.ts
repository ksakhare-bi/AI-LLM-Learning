import type { AgentTask, AgentResult, WorkerAgent } from "../types.js";

export interface ResearchData {
  category: string;
  competitors: string[];
  keyTrends: string[];
  marketOpportunity: string;
  confidenceScore: number;
}

export class ResearchSpecialist implements WorkerAgent<ResearchData> {
  readonly id: string;
  readonly role = "Domain & Market Researcher";
  readonly capabilities = ["market_analysis", "competitor_intel", "trend_forecasting"];

  constructor(id: string = "research-specialist", private readonly latencyMs: number = 300) {
    this.id = id;
  }

  async execute(
    task: AgentTask,
    signal: AbortSignal,
    sharedStateView?: Readonly<Record<string, unknown>>
  ): Promise<AgentResult<ResearchData>> {
    const startedAt = Date.now();

    if (signal.aborted) {
      throw new Error(`Worker ${this.id} aborted before execution`);
    }

    // Simulate work with cancellation support
    await this.delay(this.latencyMs, signal);

    const topic = (task.payload?.topic as string) || task.description;

    const data: ResearchData = {
      category: "Enterprise AI Infrastructure",
      competitors: ["OpenAI Enterprise", "Anthropic Claude Workspaces", "Cohere Enterprise"],
      keyTrends: [
        "Shift from single-agent LLMs to specialized multi-agent DAGs",
        "Deterministic cost/token budgets as hard production requirement",
        "Zero-trust human verification on critical path mutations"
      ],
      marketOpportunity: `High demand for autonomous, cost-bounded orchestration for ${topic}`,
      confidenceScore: 0.94
    };

    return {
      taskId: task.taskId,
      agentId: this.id,
      status: "success",
      data,
      usage: {
        tokens: 380,
        costUsd: 0.0038,
        durationMs: Date.now() - startedAt
      },
      timestamp: Date.now()
    };
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error("Execution aborted"));
      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("Execution aborted"));
        },
        { once: true }
      );
    });
  }
}
