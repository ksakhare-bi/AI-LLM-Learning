import type {
  AgentTask,
  AgentResult,
  WorkerAgent,
  AgentStatus
} from "../agents/types.js";

import type {
  AgentState,
  SupervisorOptions
} from "./state.js";

import { withTimeout, TimeoutError } from "./timeout.js";
import { TransactionalStateManager } from "./concurrency.js";
import { BudgetGuard, BudgetExceededError } from "./budget.js";
import { HitlManager, type HitlHandler } from "./hitl.js";
import { Aggregator, type AggregatedReport } from "./aggregator.js";

export class Supervisor {
  private stateManager: TransactionalStateManager;
  private budgetGuard: BudgetGuard;
  readonly hitlManager = new HitlManager();

  constructor(
    private readonly workers: WorkerAgent[],
    private readonly options: SupervisorOptions
  ) {
    const initialState: AgentState = {
      taskId: "",
      status: "pending",
      revision: 0,
      workers: {},
      results: [],
      failures: [],
      sharedData: {},
      events: [],
      hitlCheckpoints: [],
      totalUsage: { tokens: 0, costUsd: 0, durationMs: 0 },
      degraded: false
    };

    this.stateManager = new TransactionalStateManager(initialState);
    this.budgetGuard = new BudgetGuard({
      maxCostUsd: options.maxCostUsd ?? 0.10, // $0.10 default budget
      maxTokens: options.maxTokens ?? 50_000,
      workerTimeoutMs: options.workerTimeoutMs,
      globalTimeoutMs: options.globalTimeoutMs
    });
  }

  /**
   * Execute task with parallel fan-out, shared state, budget enforcement, HITL gating, and partial degradation
   */
  async execute(
    task: AgentTask,
    hitlHandler?: HitlHandler
  ): Promise<AgentState & { aggregatedReport: AggregatedReport }> {
    const startedAt = Date.now();

    // 1. Initialize state
    await this.stateManager.atomicMutate("supervisor", "TASK_STARTED", (state) => {
      state.taskId = task.taskId;
      state.status = "running";
      state.startedAt = startedAt;
      state.degraded = false;
      state.results = [];
      state.failures = [];
      state.workers = {};
      state.events = [];
      state.sharedData = { ...(task.payload || {}) };

      for (const worker of this.workers) {
        state.workers[worker.id] = {
          status: "pending"
        };
      }
    });

    const globalController = new AbortController();

    try {
      // 2. Wrap overall fan-out in global timeout and budget guard
      await withTimeout(
        this.executeParallelWorkers(task, globalController, hitlHandler),
        this.options.globalTimeoutMs,
        () => globalController.abort(),
        "Global Supervisor Execution"
      );
    } catch (err) {
      // Catch global timeout or unhandled execution errors
      const isTimeout = err instanceof TimeoutError || (err instanceof Error && err.message.includes("timed out"));
      const isBudget = err instanceof BudgetExceededError;

      await this.stateManager.atomicMutate("supervisor", isBudget ? "BUDGET_EXCEEDED" : "WORKER_FAILED", (state) => {
        state.status = "partial";
        state.degraded = true;
        state.failures.push({
          taskId: task.taskId,
          agentId: "supervisor-global-guard",
          status: isTimeout ? "timeout" : "failed",
          error: {
            code: isTimeout ? "GLOBAL_TIMEOUT" : isBudget ? "BUDGET_EXCEEDED" : "EXECUTION_ABORTED",
            message: err instanceof Error ? err.message : "Global execution interrupted"
          },
          usage: { tokens: 0, costUsd: 0, durationMs: Date.now() - startedAt },
          timestamp: Date.now()
        });
      });
    } finally {
      // Ensure pending workers are aborted
      if (!globalController.signal.aborted) {
        globalController.abort();
      }
    }

    // 3. Finalize state
    await this.stateManager.atomicMutate("supervisor", "TASK_FINISHED", (state) => {
      state.completedAt = Date.now();
      state.totalUsage = this.budgetGuard.getSnapshot();

      if (state.failures.length > 0) {
        state.status = "partial";
        state.degraded = true;
      } else {
        state.status = "completed";
      }

      state.hitlCheckpoints = this.hitlManager.getAllCheckpoints();
    });

    const finalSnapshot = this.stateManager.getSnapshot();
    const aggregatedReport = Aggregator.synthesize(finalSnapshot);

    return {
      ...finalSnapshot,
      aggregatedReport
    };
  }

  /**
   * Fan-out parallel execution across all workers with concurrency-protected shared state
   */
  private async executeParallelWorkers(
    task: AgentTask,
    globalController: AbortController,
    hitlHandler?: HitlHandler
  ): Promise<void> {
    const workerPromises = this.workers.map(async (worker) => {
      return this.executeSingleWorker(worker, task, globalController, hitlHandler);
    });

    // Use Promise.allSettled to guarantee that one failing worker NEVER terminates or crashes sibling workers prematurely
    const settled = await Promise.allSettled(workerPromises);

    // Collect results into state atomically
    for (const item of settled) {
      if (item.status === "rejected") {
        // Unexpected unhandled worker exception
        const err = item.reason;
        await this.stateManager.atomicMutate("supervisor", "WORKER_FAILED", (state) => {
          state.degraded = true;
          state.failures.push({
            taskId: task.taskId,
            agentId: "unknown-worker",
            status: "failed",
            error: {
              code: "UNHANDLED_EXCEPTION",
              message: err instanceof Error ? err.message : String(err)
            },
            usage: { tokens: 0, costUsd: 0, durationMs: 0 },
            timestamp: Date.now()
          });
        });
      }
    }
  }

  /**
   * Execute an individual worker with per-agent timeout, budget checking, and optional HITL checkpoint
   */
  private async executeSingleWorker(
    worker: WorkerAgent,
    task: AgentTask,
    globalController: AbortController,
    hitlHandler?: HitlHandler
  ): Promise<AgentResult> {
    // Check if global execution was already cancelled
    if (globalController.signal.aborted) {
      const cancelledResult: AgentResult = {
        taskId: task.taskId,
        agentId: worker.id,
        status: "cancelled",
        error: { code: "CANCELLED", message: "Global execution was aborted" },
        usage: { tokens: 0, costUsd: 0, durationMs: 0 },
        timestamp: Date.now()
      };
      await this.recordWorkerResult(worker.id, cancelledResult);
      return cancelledResult;
    }

    // Mark running
    await this.stateManager.atomicMutate(worker.id, "WORKER_DISPATCHED", (state) => {
      state.workers[worker.id] = {
        status: "running",
        startedAt: Date.now()
      };
    });

    const workerController = new AbortController();
    const forwardAbort = () => workerController.abort();
    globalController.signal.addEventListener("abort", forwardAbort, { once: true });

    const startedAt = Date.now();

    try {
      // Provide read-only view of current sharedData
      const sharedSnapshot = this.stateManager.getSnapshot().sharedData;

      // Execute worker under per-agent timeout
      const rawResult = await withTimeout(
        worker.execute(task, workerController.signal, sharedSnapshot),
        this.options.workerTimeoutMs,
        () => workerController.abort(),
        `Worker ${worker.id}`
      );

      // Record and verify budget immediately
      const budgetCheck = this.budgetGuard.recordUsage(worker.id, rawResult.usage);
      if (!budgetCheck.withinBudget) {
        // Budget breach triggers global abort
        globalController.abort();
        throw budgetCheck.error!;
      }

      let finalResult = rawResult;

      // Optional HITL checkpoint gating
      const shouldTriggerHitl =
        this.options.hitlEnabled &&
        (!this.options.hitlCheckpointAgentId || this.options.hitlCheckpointAgentId === worker.id);

      if (shouldTriggerHitl) {
        await this.stateManager.atomicMutate(worker.id, "HITL_INTERRUPTED", (state) => {
          state.status = "interrupted";
        });

        const { decision, effectiveData } = await this.hitlManager.createCheckpointAndWait(
          worker.id,
          rawResult.data,
          hitlHandler
        );

        if (decision.action === "reject") {
          finalResult = {
            ...rawResult,
            status: "failed",
            error: {
              code: "HITL_REJECTED",
              message: decision.feedback || `Rejected by reviewer: ${decision.reviewer}`
            }
          };
        } else {
          finalResult = {
            ...rawResult,
            data: effectiveData
          };
        }

        await this.stateManager.atomicMutate(worker.id, "HITL_RESUMED", (state) => {
          state.status = "running";
        });
      }

      await this.recordWorkerResult(worker.id, finalResult);
      return finalResult;
    } catch (error) {
      const isTimeout =
        error instanceof TimeoutError ||
        (error instanceof Error && error.message.toLowerCase().includes("timed out"));
      const isBudget = error instanceof BudgetExceededError;

      const failureResult: AgentResult = {
        taskId: task.taskId,
        agentId: worker.id,
        status: isTimeout ? "timeout" : "failed",
        error: {
          code: isTimeout ? "AGENT_TIMEOUT" : isBudget ? "BUDGET_EXCEEDED" : "AGENT_EXECUTION_FAILED",
          message: error instanceof Error ? error.message : "Unknown agent failure"
        },
        usage: {
          tokens: 0,
          costUsd: 0,
          durationMs: Date.now() - startedAt
        },
        timestamp: Date.now()
      };

      await this.recordWorkerResult(worker.id, failureResult);
      return failureResult;
    } finally {
      globalController.signal.removeEventListener("abort", forwardAbort);
    }
  }

  private async recordWorkerResult(agentId: string, result: AgentResult): Promise<void> {
    await this.stateManager.atomicMutate(agentId, result.status === "success" ? "WORKER_COMPLETED" : "WORKER_FAILED", (state) => {
      state.workers[agentId] = {
        status: result.status,
        result,
        completedAt: Date.now()
      };

      if (result.status === "success") {
        state.results.push(result);
        // Worker writes its result into shared blackboard for other agents or reducer
        state.sharedData[agentId] = result.data;
      } else {
        state.failures.push(result);
        state.degraded = true;
      }
    });
  }

  getState(): Readonly<AgentState> {
    return this.stateManager.getSnapshot();
  }
}