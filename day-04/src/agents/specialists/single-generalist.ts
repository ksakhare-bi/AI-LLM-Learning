import type { AgentTask, AgentResult, WorkerAgent } from "../types.js";

export interface SingleAgentData {
  generalAnalysis: string;
  depthScore: number;
  coverageBreadth: number;
  specializationScore: number;
}

export class SingleGeneralistAgent implements WorkerAgent<SingleAgentData> {
  readonly id = "single-generalist-agent";
  readonly role = "Monolithic Generalist Agent";
  readonly capabilities = ["broad_reasoning", "general_synthesis"];

  constructor(private readonly latencyMs: number = 850) {}

  async execute(
    task: AgentTask,
    signal: AbortSignal,
    sharedStateView?: Readonly<Record<string, unknown>>
  ): Promise<AgentResult<SingleAgentData>> {
    const startedAt = Date.now();

    if (signal.aborted) {
      throw new Error(`Worker ${this.id} aborted before execution`);
    }

    // Must execute all sub-tasks sequentially within one single context window
    await this.delay(this.latencyMs, signal);

    const data: SingleAgentData = {
      generalAnalysis:
        `Generalist evaluation of ${task.description}: Covers basic research trends, surface-level pricing estimates, ` +
        `and generalized compliance notes within a single unified context window.`,
      depthScore: 0.65, // Lower depth due to split attention / single prompt
      coverageBreadth: 0.82,
      specializationScore: 0.58
    };

    return {
      taskId: task.taskId,
      agentId: this.id,
      status: "success",
      data,
      usage: {
        tokens: 950, // Monolithic prompt with all instructions bundled
        costUsd: 0.0095,
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
