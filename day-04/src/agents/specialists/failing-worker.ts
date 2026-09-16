import type { AgentTask, AgentResult, WorkerAgent } from "../types.js";

export type FailureType = "exception" | "timeout" | "budget_exhaustion";

export interface FailingWorkerOptions {
  failureType?: FailureType;
  delayMs?: number;
  errorMessage?: string;
  costSpikeUsd?: number;
}

export class FailingWorker implements WorkerAgent {
  readonly id: string;
  readonly role = "Fault Injection Worker";
  readonly capabilities = ["fault_simulation", "failure_resilience_test"];

  private failureType: FailureType;
  private delayMs: number;
  private errorMessage: string;
  private costSpikeUsd: number;

  constructor(id: string = "failing-worker", options: FailingWorkerOptions = {}) {
    this.id = id;
    this.failureType = options.failureType ?? "exception";
    this.delayMs = options.delayMs ?? 400;
    this.errorMessage = options.errorMessage ?? "Simulated downstream network partition / service crash";
    this.costSpikeUsd = options.costSpikeUsd ?? 10.0;
  }

  async execute(
    task: AgentTask,
    signal: AbortSignal,
    sharedStateView?: Readonly<Record<string, unknown>>
  ): Promise<AgentResult> {
    const startedAt = Date.now();

    if (signal.aborted) {
      throw new Error(`Worker ${this.id} aborted before execution`);
    }

    if (this.failureType === "timeout") {
      // Hang indefinitely or for an excessively long time until signal aborts
      await this.delay(this.delayMs, signal);
      throw new Error("Worker exceeded operational deadline");
    }

    if (this.failureType === "budget_exhaustion") {
      await this.delay(50, signal);
      return {
        taskId: task.taskId,
        agentId: this.id,
        status: "success",
        data: { alert: "Excessive token explosion" },
        usage: {
          tokens: 500_000,
          costUsd: this.costSpikeUsd,
          durationMs: Date.now() - startedAt
        },
        timestamp: Date.now()
      };
    }

    // Default: throw unhandled runtime exception after simulated delay
    await this.delay(this.delayMs, signal);
    throw new Error(`${this.id}: ${this.errorMessage}`);
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error("Execution aborted"));
      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("Execution aborted by supervisor"));
        },
        { once: true }
      );
    });
  }
}
