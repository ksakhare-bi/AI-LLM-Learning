import type { AgentDecisionProvider } from "../runtime.js";
import { AgentRuntime } from "../runtime.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { ToolExecutor } from "../tools/tool-executor.js";
import { createAgentState } from "../../config/state.js";
import { PrecisionRecallEvaluator } from "./precision-recall.js";
import { TrajectoryScorer } from "./trajectory-scorer.js";
import type { EvalTask, TaskEvalResult, BenchmarkSummary } from "./types.js";

export interface BenchmarkRunnerConfig {
  tasks: EvalTask[];
  toolRegistry: ToolRegistry;
  toolExecutor?: ToolExecutor;
  decisionProviderFactory: (task: EvalTask) => AgentDecisionProvider;
}

export class AgentBenchmarkRunner {
  static async run(config: BenchmarkRunnerConfig): Promise<BenchmarkSummary> {
    const results: TaskEvalResult[] = [];
    const executor = config.toolExecutor ?? new ToolExecutor();

    for (const task of config.tasks) {
      const decisionProvider = config.decisionProviderFactory(task);
      const runtime = new AgentRuntime(
        decisionProvider,
        { maxSteps: task.maxAllowedSteps },
        config.toolRegistry,
        executor
      );

      const state = createAgentState({
        messages: task.initialMessages
      });

      let failureReason: string | undefined;

      try {
        await runtime.run(state);
      } catch (err) {
        failureReason = (err as Error).message;
      }

      const finalAssistantMsg = state.messages
        .filter(m => m.role === "assistant")
        .slice(-1)[0]?.content;

      // Verification of success
      let success = state.status === "COMPLETED";

      if (success && task.expectedFinalAnswerPattern && finalAssistantMsg) {
        success = task.expectedFinalAnswerPattern.test(finalAssistantMsg);
        if (!success) {
          failureReason = `Final answer "${finalAssistantMsg}" did not match pattern ${task.expectedFinalAnswerPattern}`;
        }
      }

      const toolMetrics = PrecisionRecallEvaluator.evaluate(
        task.expectedToolCalls,
        state.toolCalls
      );

      const trajectoryMetrics = TrajectoryScorer.score(
        task.optimalStepCount,
        task.maxAllowedSteps,
        state
      );

      results.push({
        taskId: task.id,
        taskName: task.name,
        success,
        finalStatus: state.status,
        finalAnswer: finalAssistantMsg,
        toolMetrics,
        trajectoryMetrics,
        failureReason
      });
    }

    const totalTasks = results.length;
    const successfulTasks = results.filter(r => r.success).length;
    const taskSuccessRate = totalTasks > 0 ? successfulTasks / totalTasks : 0;

    const averageToolPrecision =
      totalTasks > 0
        ? results.reduce((sum, r) => sum + r.toolMetrics.precision, 0) / totalTasks
        : 0;

    const averageToolRecall =
      totalTasks > 0
        ? results.reduce((sum, r) => sum + r.toolMetrics.recall, 0) / totalTasks
        : 0;

    const averageToolF1 =
      totalTasks > 0
        ? results.reduce((sum, r) => sum + r.toolMetrics.f1, 0) / totalTasks
        : 0;

    const averageTrajectoryScore =
      totalTasks > 0
        ? results.reduce((sum, r) => sum + r.trajectoryMetrics.trajectoryScore, 0) / totalTasks
        : 0;

    return {
      totalTasks,
      successfulTasks,
      taskSuccessRate: Number(taskSuccessRate.toFixed(4)),
      averageToolPrecision: Number(averageToolPrecision.toFixed(4)),
      averageToolRecall: Number(averageToolRecall.toFixed(4)),
      averageToolF1: Number(averageToolF1.toFixed(4)),
      averageTrajectoryScore: Number(averageTrajectoryScore.toFixed(4)),
      taskResults: results
    };
  }
}
