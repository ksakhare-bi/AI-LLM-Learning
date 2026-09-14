import type { LLMMessage, AgentToolCall } from "../../config/types.js";

export interface ExpectedToolSpec {
  toolName: string;
  argumentsMatcher?: (args: unknown) => boolean;
}

export interface EvalTask {
  id: string;
  name: string;
  description: string;
  initialMessages: LLMMessage[];
  expectedFinalAnswerPattern?: RegExp;
  expectedToolCalls: ExpectedToolSpec[];
  optimalStepCount: number;
  maxAllowedSteps: number;
}

export interface ToolMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface TrajectoryMetrics {
  stepsTaken: number;
  optimalSteps: number;
  stepEfficiency: number; // 0.0 to 1.0
  failedToolCalls: number;
  trajectoryScore: number; // 0.0 to 1.0
}

export interface TaskEvalResult {
  taskId: string;
  taskName: string;
  success: boolean;
  finalStatus: string;
  finalAnswer?: string;
  toolMetrics: ToolMetrics;
  trajectoryMetrics: TrajectoryMetrics;
  failureReason?: string;
}

export interface BenchmarkSummary {
  totalTasks: number;
  successfulTasks: number;
  taskSuccessRate: number; // 0.0 to 1.0
  averageToolPrecision: number;
  averageToolRecall: number;
  averageToolF1: number;
  averageTrajectoryScore: number;
  taskResults: TaskEvalResult[];
}
