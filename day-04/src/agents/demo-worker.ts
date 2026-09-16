import type {
  AgentTask,
  AgentResult,
  WorkerAgent
} from "./types.js";

export class DemoWorker implements WorkerAgent {
  constructor(
    public readonly id: string,
    private readonly delayMs = 500
  ) {}

  async execute(
    task: AgentTask,
    signal: AbortSignal
  ): Promise<AgentResult> {
    const startedAt = Date.now();

    await this.delay(
      this.delayMs,
      signal
    );

    return {
      taskId: task.taskId,
      agentId: this.id,
      status: "success",

      data: {
        message:
          `${this.id} completed: ${task.description}`
      },

      usage: {
        tokens: 100,
        costUsd: 0.01,
        durationMs: Date.now() - startedAt
      }
    };
  }

  private delay(
    ms: number,
    signal: AbortSignal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error("Agent execution cancelled"));
        return;
      }

      const timer = setTimeout(resolve, ms);

      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("Agent execution cancelled"));
        },
        { once: true }
      );
    });
  }
}