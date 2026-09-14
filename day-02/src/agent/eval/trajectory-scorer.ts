import type { AgentState } from "../../config/types.js";
import type { TrajectoryMetrics } from "./types.js";

export class TrajectoryScorer {
  static score(
    optimalSteps: number,
    maxAllowedSteps: number,
    finalState: AgentState
  ): TrajectoryMetrics {
    const stepsTaken = finalState.currentStep;
    const failedToolCalls = finalState.toolResults.filter(r => !r.success).length;

    let stepEfficiency: number;
    if (stepsTaken <= optimalSteps) {
      stepEfficiency = 1.0;
    } else {
      const excess = stepsTaken - optimalSteps;
      const allowableExcess = Math.max(1, maxAllowedSteps - optimalSteps);
      stepEfficiency = Math.max(0, 1 - excess / allowableExcess);
    }

    const toolCleanliness =
      finalState.toolResults.length === 0
        ? 1.0
        : Math.max(0, 1 - failedToolCalls / finalState.toolResults.length);

    const completionFactor = finalState.status === "COMPLETED" ? 1.0 : 0.0;

    // Composite trajectory quality score: 50% completion, 30% step efficiency, 20% tool cleanliness
    const trajectoryScore =
      completionFactor * 0.5 +
      stepEfficiency * 0.3 +
      toolCleanliness * 0.2;

    return {
      stepsTaken,
      optimalSteps,
      stepEfficiency: Number(stepEfficiency.toFixed(4)),
      failedToolCalls,
      trajectoryScore: Number(trajectoryScore.toFixed(4))
    };
  }
}
