import type {
  AgentResult,
  AgentStatus,
  HitlCheckpoint,
  AgentUsage
} from "../agents/types.js";

export interface StateEvent {
  eventId: string;
  timestamp: number;
  type:
    | "TASK_STARTED"
    | "WORKER_DISPATCHED"
    | "WORKER_COMPLETED"
    | "WORKER_FAILED"
    | "STATE_MUTATED"
    | "HITL_INTERRUPTED"
    | "HITL_RESUMED"
    | "BUDGET_EXCEEDED"
    | "TASK_FINISHED";
  actor: string;
  payload: Record<string, unknown>;
  revision: number;
}

export interface WorkerRunState {
  status: AgentStatus;
  result?: AgentResult;
  startedAt?: number;
  completedAt?: number;
}

export interface AgentState {
  taskId: string;
  status: "pending" | "running" | "completed" | "partial" | "failed" | "interrupted";
  revision: number; // Incrementing counter for Optimistic Concurrency Control (OCC)
  workers: Record<string, WorkerRunState>;
  results: AgentResult[];
  failures: AgentResult[];
  sharedData: Record<string, unknown>; // Blackboard data accessible to all workers
  events: StateEvent[];
  hitlCheckpoints: HitlCheckpoint[];
  totalUsage: AgentUsage;
  degraded: boolean;
  startedAt?: number;
  completedAt?: number;
}

export interface SupervisorOptions {
  workerTimeoutMs: number;
  globalTimeoutMs: number;
  maxCostUsd?: number;
  maxTokens?: number;
  requireAllWorkers?: boolean; // If false, partial failure is allowed and degraded: true is returned
  hitlEnabled?: boolean;
  hitlCheckpointAgentId?: string; // Optional agent whose output triggers a mandatory HITL review
}