import { z } from "zod";

export type AgentStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "timeout"
  | "cancelled";

export interface AgentTask {
  taskId: string;
  agentId?: string;
  taskType: string;
  description: string;
  payload?: Record<string, unknown>;
  priority?: "low" | "normal" | "high";
  idempotencyKey?: string;
}

export interface AgentUsage {
  tokens: number;
  costUsd: number;
  durationMs: number;
}

export interface AgentError {
  code: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
}

export interface AgentResult<T = unknown> {
  taskId: string;
  agentId: string;
  status: AgentStatus;
  data?: T;
  error?: AgentError;
  usage: AgentUsage;
  timestamp: number;
}

export interface WorkerAgent<T = unknown> {
  readonly id: string;
  readonly role: string;
  readonly capabilities: string[];

  execute(
    task: AgentTask,
    signal: AbortSignal,
    sharedStateView?: Readonly<Record<string, unknown>>
  ): Promise<AgentResult<T>>;
}

export interface BudgetLimits {
  maxCostUsd: number;
  maxTokens: number;
  workerTimeoutMs: number;
  globalTimeoutMs: number;
}

export type HitlAction = "approve" | "edit" | "reject";

export interface HitlDecision {
  action: HitlAction;
  reviewer: string;
  feedback?: string;
  editedData?: unknown;
  timestamp: number;
}

export interface HitlCheckpoint {
  checkpointId: string;
  agentId: string;
  timestamp: number;
  status: "pending_review" | "approved" | "edited" | "rejected";
  dataToReview: unknown;
  decision?: HitlDecision;
}

// Zod schemas for runtime message contracts validation
export const AgentTaskSchema = z.object({
  taskId: z.string().min(1),
  agentId: z.string().optional(),
  taskType: z.string().min(1),
  description: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  idempotencyKey: z.string().optional(),
});

export const AgentResultSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
  status: z.enum(["pending", "running", "success", "failed", "timeout", "cancelled"]),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean().optional(),
      details: z.unknown().optional(),
    })
    .optional(),
  usage: z.object({
    tokens: z.number().nonnegative(),
    costUsd: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
  }),
  timestamp: z.number(),
});