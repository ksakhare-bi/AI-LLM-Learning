import type { AgentToolCall } from "../../config/types.js";
import type { ExpectedToolSpec, ToolMetrics } from "./types.js";

export class PrecisionRecallEvaluator {
  static evaluate(
    expectedSpecs: ExpectedToolSpec[],
    actualCalls: AgentToolCall[]
  ): ToolMetrics {
    if (expectedSpecs.length === 0 && actualCalls.length === 0) {
      return {
        truePositives: 0,
        falsePositives: 0,
        falseNegatives: 0,
        precision: 1.0,
        recall: 1.0,
        f1: 1.0
      };
    }

    const matchedExpectedIndices = new Set<number>();
    let truePositives = 0;
    let falsePositives = 0;

    for (const actual of actualCalls) {
      let matchedIndex = -1;

      for (let i = 0; i < expectedSpecs.length; i++) {
        if (matchedExpectedIndices.has(i)) continue;
        const exp = expectedSpecs[i];

        if (exp.toolName === actual.toolName) {
          if (!exp.argumentsMatcher || exp.argumentsMatcher(actual.arguments)) {
            matchedIndex = i;
            break;
          }
        }
      }

      if (matchedIndex !== -1) {
        matchedExpectedIndices.add(matchedIndex);
        truePositives++;
      } else {
        falsePositives++;
      }
    }

    const falseNegatives = expectedSpecs.length - matchedExpectedIndices.size;

    const precision =
      truePositives + falsePositives === 0
        ? expectedSpecs.length === 0 ? 1.0 : 0.0
        : truePositives / (truePositives + falsePositives);

    const recall =
      truePositives + falseNegatives === 0
        ? 1.0
        : truePositives / (truePositives + falseNegatives);

    const f1 =
      precision + recall === 0
        ? 0.0
        : (2 * precision * recall) / (precision + recall);

    return {
      truePositives,
      falsePositives,
      falseNegatives,
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1: Number(f1.toFixed(4))
    };
  }
}
