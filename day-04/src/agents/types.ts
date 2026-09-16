

export type AgentStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "timeout";

export interface AgentTask {
  taskId: string;
  description: string;
}

export interface AgentResult {
  taskId: string;
  agentId: string;

  status: AgentStatus;

  data?: unknown;

  error?: {
    code: string;
    message: string;
  };

  usage: {
    tokens: number;
    costUsd: number;
    durationMs: number;
  };
}

export interface WorkerAgent {
  readonly id: string;

  execute(
    task: AgentTask,
    signal: AbortSignal
  ): Promise<AgentResult>;
}