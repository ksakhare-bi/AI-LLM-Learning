import type { AgentResult } from "../agents/types.js";
import type { AgentState } from "./state.js";

export interface AggregatedReport {
  taskId: string;
  isDegraded: boolean;
  qualityScore: number;
  facetsCollected: string[];
  facetsMissing: string[];
  synthesis: {
    summary: string;
    marketAnalysis?: unknown;
    financials?: unknown;
    compliance?: unknown;
  };
  failures: Array<{
    agentId: string;
    errorCode: string;
    errorMessage: string;
  }>;
  totalCostUsd: number;
  totalTokens: number;
  durationMs: number;
}

export class Aggregator {
  /**
   * Aggregate and synthesize state into a unified production report
   */
  static synthesize(state: AgentState): AggregatedReport {
    const successfulResults = state.results;
    const failures = state.failures;
    const isDegraded = state.degraded || failures.length > 0;

    const facetsCollected: string[] = [];
    const facetsMissing: string[] = [];
    let marketAnalysis: unknown;
    let financials: unknown;
    let compliance: unknown;

    for (const res of successfulResults) {
      if (res.agentId.includes("research") || res.agentId.includes("demo")) {
        facetsCollected.push("market_research");
        marketAnalysis = res.data;
      } else if (res.agentId.includes("data") || res.agentId.includes("pricing")) {
        facetsCollected.push("financial_modeling");
        financials = res.data;
      } else if (res.agentId.includes("compliance") || res.agentId.includes("risk")) {
        facetsCollected.push("regulatory_compliance");
        compliance = res.data;
      } else {
        facetsCollected.push(res.agentId);
      }
    }

    for (const fail of failures) {
      if (fail.agentId.includes("compliance") || fail.agentId.includes("risk")) {
        facetsMissing.push("regulatory_compliance");
      } else if (fail.agentId.includes("data") || fail.agentId.includes("pricing")) {
        facetsMissing.push("financial_modeling");
      } else if (fail.agentId.includes("research")) {
        facetsMissing.push("market_research");
      } else {
        facetsMissing.push(fail.agentId);
      }
    }

    // Quality score calculation based on facet completeness and success ratio
    const totalExpected = Math.max(1, successfulResults.length + failures.length);
    const successRatio = successfulResults.length / totalExpected;
    // High base quality when specialists succeed, scaled by completeness
    const qualityScore = Number((successRatio * 0.95).toFixed(2));

    const summary = isDegraded
      ? `Partially completed synthesis (${facetsCollected.join(", ")}). Missing: ${facetsMissing.join(", ")}. Degraded mode active.`
      : `Complete multi-agent synthesis across all domains: ${facetsCollected.join(", ")}.`;

    const failureDetails = failures.map((f) => ({
      agentId: f.agentId,
      errorCode: f.error?.code ?? "UNKNOWN_FAILURE",
      errorMessage: f.error?.message ?? "Operation failed"
    }));

    return {
      taskId: state.taskId,
      isDegraded,
      qualityScore,
      facetsCollected,
      facetsMissing,
      synthesis: {
        summary,
        marketAnalysis: marketAnalysis ?? { note: "Facet unavailable due to worker failure" },
        financials: financials ?? { note: "Facet unavailable due to worker failure" },
        compliance: compliance ?? { note: "Facet unavailable due to worker failure" }
      },
      failures: failureDetails,
      totalCostUsd: state.totalUsage.costUsd,
      totalTokens: state.totalUsage.tokens,
      durationMs: state.completedAt && state.startedAt ? state.completedAt - state.startedAt : state.totalUsage.durationMs
    };
  }
}
