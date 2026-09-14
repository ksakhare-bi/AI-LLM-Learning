import type { AgentState } from "../config/types.js";

export interface AgentBudget {
  maxSteps?: number;
  maxCostUsd?: number;
  maxTokens?: number;
}

export class AgentBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentBudgetExceededError";
  }
}

export class AgentBudgetGuard {
  constructor(private readonly budget: AgentBudget) {}

  check(state: AgentState): void {
    if (
      this.budget.maxSteps !== undefined &&
      state.currentStep >= this.budget.maxSteps
    ) {
      throw new AgentBudgetExceededError(
        `Agent budget exceeded: maximum steps limit (${this.budget.maxSteps}) reached.`
      );
    }

    if (
      this.budget.maxCostUsd !== undefined &&
      state.cost.totalCostUsd >= this.budget.maxCostUsd
    ) {
      throw new AgentBudgetExceededError(
        `Agent budget exceeded: maximum cost limit ($${this.budget.maxCostUsd}) reached.`
      );
    }

    if (
      this.budget.maxTokens !== undefined &&
      state.usage.totalTokens >= this.budget.maxTokens
    ) {
      throw new AgentBudgetExceededError(
        `Agent budget exceeded: maximum tokens limit (${this.budget.maxTokens}) reached.`
      );
    }
  }
}
