import type { AgentTask, AgentResult, WorkerAgent } from "../types.js";

export interface DataAnalystData {
  projectedTamUsd: number;
  projectedSamUsd: number;
  suggestedPricingTier: {
    developerMonthlyUsd: number;
    enterpriseMonthlyUsd: number;
  };
  unitEconomicsMargin: number;
  expectedLtvCacRatio: number;
}

export class DataAnalystSpecialist implements WorkerAgent<DataAnalystData> {
  readonly id: string;
  readonly role = "Quantitative Financial & Metrics Analyst";
  readonly capabilities = ["pricing_modeling", "tam_sam_forecast", "unit_economics"];

  constructor(id: string = "data-analyst", private readonly latencyMs: number = 400) {
    this.id = id;
  }

  async execute(
    task: AgentTask,
    signal: AbortSignal,
    sharedStateView?: Readonly<Record<string, unknown>>
  ): Promise<AgentResult<DataAnalystData>> {
    const startedAt = Date.now();

    if (signal.aborted) {
      throw new Error(`Worker ${this.id} aborted before execution`);
    }

    await this.delay(this.latencyMs, signal);

    const baseBudget = (task.payload?.budget as number) || 50000;

    const data: DataAnalystData = {
      projectedTamUsd: 14_500_000_000,
      projectedSamUsd: 1_850_000_000,
      suggestedPricingTier: {
        developerMonthlyUsd: 49,
        enterpriseMonthlyUsd: 1_200
      },
      unitEconomicsMargin: 0.78,
      expectedLtvCacRatio: 4.2
    };

    return {
      taskId: task.taskId,
      agentId: this.id,
      status: "success",
      data,
      usage: {
        tokens: 420,
        costUsd: 0.0042,
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
