import type { AgentDecision } from "../../config/decision.js";
import type { AgentState } from "../../config/types.js";
import type { ToolRegistry } from "../tools/tool-registry.js";

export interface CritiqueResult {
  passed: boolean;
  score: number; // 0.0 to 1.0
  reasons: string[];
  suggestedRevision?: AgentDecision;
}

export interface SelfCritiquePolicy {
  validateToolExistence?: boolean;
  disallowEmptyArguments?: boolean;
  customCheck?: (decision: AgentDecision, state: AgentState) => Promise<CritiqueResult | null>;
}

export class SelfCritiqueEngine {
  constructor(
    private readonly toolRegistry?: ToolRegistry,
    private readonly policy: SelfCritiquePolicy = {
      validateToolExistence: true,
      disallowEmptyArguments: true
    }
  ) {}

  async critique(
    decision: AgentDecision,
    state: AgentState
  ): Promise<CritiqueResult> {
    const reasons: string[] = [];

    // Check 1: Tool Call verification
    if (decision.type === "TOOL_CALL") {
      const { toolName, arguments: args } = decision.toolCall;

      if (this.policy.validateToolExistence && this.toolRegistry) {
        const registered = this.toolRegistry.get(toolName);
        if (!registered) {
          reasons.push(`Hallucinated tool name "${toolName}" does not exist in registry`);
        }
      }

      if (this.policy.disallowEmptyArguments && toolName !== "flakyTool" && toolName !== "slowTool") {
        if (args === undefined || args === null) {
          reasons.push(`Tool call "${toolName}" passed null or undefined arguments`);
        } else if (typeof args === "object" && Object.keys(args).length === 0) {
          reasons.push(`Tool call "${toolName}" passed an empty arguments object`);
        }
      }

      // Check repeated failing tool calls
      const pastResultsForTool = state.toolResults.filter(r => r.toolName === toolName);
      if (pastResultsForTool.length >= 2 && pastResultsForTool.slice(-2).every(r => !r.success)) {
        reasons.push(`Tool "${toolName}" has failed repeatedly in the last 2 steps; alter arguments or plan.`);
      }
    }

    // Check 2: Final Answer sanity
    if (decision.type === "FINAL") {
      if (!decision.content || decision.content.trim().length === 0) {
        reasons.push("Final answer is empty");
      }

      // Check if unresolved tool errors exist without explanation
      const lastToolResult = state.toolResults[state.toolResults.length - 1];
      const hasUnresolvedError = lastToolResult && !lastToolResult.success;
      if (hasUnresolvedError && !decision.content.toLowerCase().includes("error") && !decision.content.toLowerCase().includes("failed")) {
        reasons.push("Final answer does not acknowledge unresolved tool execution failure in trajectory");
      }
    }

    // Check 3: Custom policy check
    if (this.policy.customCheck) {
      const custom = await this.policy.customCheck(decision, state);
      if (custom && !custom.passed) {
        reasons.push(...custom.reasons);
      }
    }

    const passed = reasons.length === 0;
    const score = passed ? 1.0 : Math.max(0.1, 1.0 - (reasons.length * 0.3));

    return {
      passed,
      score,
      reasons
    };
  }
}
