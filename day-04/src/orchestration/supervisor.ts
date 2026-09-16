import type {
  AgentTask,
  AgentResult,
  WorkerAgent
} from "../agents/types.js";

import type {
  AgentState,
  SupervisorOptions
} from "./state.js";

import { withTimeout } from "./timeout.js";

export class Supervisor {
  private state: AgentState;

  constructor(
    private readonly workers: WorkerAgent[],
    private readonly options: SupervisorOptions
  ) {
    this.state = {
      taskId: "",
      status: "pending",
      workers: {},
      results: [],
      failures: []
    };
  }

  async execute(
    task: AgentTask
  ): Promise<AgentState> {
    this.state = {
      taskId: task.taskId,
      status: "running",
      workers: {},
      results: [],
      failures: [],
      startedAt: Date.now()
    };

    for (const worker of this.workers) {
      this.state.workers[worker.id] = {
        status: "pending"
      };
    }

    const controller = new AbortController();

    const execution = this.executeWorkers(
      task,
      controller.signal
    );

    return withTimeout(
      execution,
      this.options.globalTimeoutMs,
      () => controller.abort()
    );
  }

  private async executeWorkers(
    task: AgentTask,
    signal: AbortSignal
  ): Promise<AgentState> {
    const results = await Promise.all(
      this.workers.map(worker =>
        this.executeWorker(
          worker,
          task,
          signal
        )
      )
    );

    for (const result of results) {
      if (result.status === "success") {
        this.state.results.push(result);
      } else {
        this.state.failures.push(result);
      }
    }

    this.state.status =
      this.state.failures.length > 0
        ? "partial"
        : "completed";

    this.state.completedAt = Date.now();

    return this.state;
  }

  private async executeWorker(
    worker: WorkerAgent,
    task: AgentTask,
    parentSignal: AbortSignal
  ): Promise<AgentResult> {
    this.state.workers[worker.id].status =
      "running";

    const controller = new AbortController();

    const abortFromParent = () => {
      controller.abort();
    };

    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener(
        "abort",
        abortFromParent,
        { once: true }
      );
    }

    try {
      const result = await withTimeout(
        worker.execute(
          task,
          controller.signal
        ),
        this.options.workerTimeoutMs,
        () => controller.abort()
      );

      this.state.workers[worker.id] = {
        status: result.status,
        result
      };

      return result;

    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        error.message.includes("timed out");

      const result: AgentResult = {
        taskId: task.taskId,
        agentId: worker.id,

        status: isTimeout
          ? "timeout"
          : "failed",

        error: {
          code: isTimeout
            ? "AGENT_TIMEOUT"
            : "AGENT_EXECUTION_FAILED",

          message:
            error instanceof Error
              ? error.message
              : "Unknown agent error"
        },

        usage: {
          tokens: 0,
          costUsd: 0,
          durationMs: 0
        }
      };

      this.state.workers[worker.id] = {
        status: result.status,
        result
      };

      return result;
    } finally {
      parentSignal.removeEventListener("abort", abortFromParent);
    }
  }
}