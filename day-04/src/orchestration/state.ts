import type {
  AgentResult,
  AgentStatus
} from "../agents/types.js";

export interface AgentState {
  taskId: string;

  status: "pending" | "running" | "completed" | "partial";

  workers: Record<
    string,
    {
      status: AgentStatus;
      result?: AgentResult;
    }
  >;

  results: AgentResult[];

  failures: AgentResult[];

  startedAt?: number;

  completedAt?: number;
}


export interface SupervisorOptions {
  workerTimeoutMs: number;
  globalTimeoutMs: number;
}