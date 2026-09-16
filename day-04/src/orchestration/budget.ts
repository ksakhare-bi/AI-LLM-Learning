import type { AgentUsage, BudgetLimits } from "../agents/types.js";

export class BudgetExceededError extends Error {
  constructor(public readonly limitType: "cost" | "tokens" | "time", public readonly current: number, public readonly limit: number) {
    super(`Global budget exceeded for ${limitType}: current ${current} exceeds limit ${limit}`);
    this.name = "BudgetExceededError";
  }
}

export class BudgetGuard {
  private totalCostUsd = 0;
  private totalTokens = 0;
  private startedAt = Date.now();
  private usageByAgent: Record<string, AgentUsage> = {};

  constructor(public readonly limits: BudgetLimits) {}

  /**
   * Atomically record usage for an agent and verify global thresholds
   */
  recordUsage(agentId: string, usage: AgentUsage): { withinBudget: boolean; error?: BudgetExceededError } {
    this.totalCostUsd += usage.costUsd;
    this.totalTokens += usage.tokens;

    if (!this.usageByAgent[agentId]) {
      this.usageByAgent[agentId] = { tokens: 0, costUsd: 0, durationMs: 0 };
    }
    this.usageByAgent[agentId].tokens += usage.tokens;
    this.usageByAgent[agentId].costUsd += usage.costUsd;
    this.usageByAgent[agentId].durationMs += usage.durationMs;

    if (this.totalCostUsd > this.limits.maxCostUsd) {
      return {
        withinBudget: false,
        error: new BudgetExceededError("cost", this.totalCostUsd, this.limits.maxCostUsd)
      };
    }

    if (this.totalTokens > this.limits.maxTokens) {
      return {
        withinBudget: false,
        error: new BudgetExceededError("tokens", this.totalTokens, this.limits.maxTokens)
      };
    }

    return { withinBudget: true };
  }

  /**
   * Check if global time budget is exceeded
   */
  checkTimeBudget(): { withinBudget: boolean; error?: BudgetExceededError } {
    const elapsed = Date.now() - this.startedAt;
    if (elapsed > this.limits.globalTimeoutMs) {
      return {
        withinBudget: false,
        error: new BudgetExceededError("time", elapsed, this.limits.globalTimeoutMs)
      };
    }
    return { withinBudget: true };
  }

  /**
   * Calculate remaining budget envelope
   */
  getRemainingBudget() {
    const elapsed = Date.now() - this.startedAt;
    return {
      remainingCostUsd: Math.max(0, this.limits.maxCostUsd - this.totalCostUsd),
      remainingTokens: Math.max(0, this.limits.maxTokens - this.totalTokens),
      remainingTimeMs: Math.max(0, this.limits.globalTimeoutMs - elapsed),
      totalSpentCostUsd: this.totalCostUsd,
      totalSpentTokens: this.totalTokens,
      elapsedMs: elapsed
    };
  }

  getSnapshot(): AgentUsage {
    return {
      tokens: this.totalTokens,
      costUsd: Number(this.totalCostUsd.toFixed(6)),
      durationMs: Date.now() - this.startedAt
    };
  }
}
