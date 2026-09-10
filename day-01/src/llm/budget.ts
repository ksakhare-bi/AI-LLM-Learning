import type {
  LLMRequest,
  LLMUsage
} from "./types.js";

import {
  getModelPricing
} from "./pricing.js";

export class LLMBudgetExceededError
  extends Error
{
  constructor(
    message = "LLM budget exceeded"
  ) {
    super(message);
    this.name =
      "LLMBudgetExceededError";
  }
}

export interface BudgetConfig {
  maxBudgetUsd: number;
}

export class LLMBudget {
  private spentUsd = 0;

  constructor(
    private readonly config: BudgetConfig
  ) {}

  getSpent(): number {
    return this.spentUsd;
  }

  getRemaining(): number {
    return Math.max(
      0,
      this.config.maxBudgetUsd -
        this.spentUsd
    );
  }

  estimateRequestCost(
    request: LLMRequest
  ): number {
    const pricing = getModelPricing(request.model);

    const inputTokens =
      request.messages.reduce(
        (total, message) =>
          total +
          Math.ceil(
            message.content.length /
              4
          ),
        0
      );

    const outputTokens = request.maxTokens ?? 0;

    return (
      (inputTokens /
        1_000_000) *
        pricing.inputPerMillionTokens +
      (outputTokens /
        1_000_000) *
        pricing.outputPerMillionTokens
    );
  }

  checkBudget(
    request: LLMRequest
  ): void {
    const estimatedCost =
      this.estimateRequestCost(
        request
      );

    if (
      this.spentUsd +
        estimatedCost >
      this.config.maxBudgetUsd
    ) {
      throw new LLMBudgetExceededError(
        `LLM budget exceeded. ` +
        `Current spend: $${this.spentUsd.toFixed(6)}, ` +
        `Estimated request: $${estimatedCost.toFixed(6)}, ` +
        `Budget: $${this.config.maxBudgetUsd.toFixed(6)}`
      );
    }
  }

  recordUsage(
    model: string,
    usage: LLMUsage
  ): number {
    const pricing =
      getModelPricing(model);

    const inputCost =
      (usage.inputTokens /
        1_000_000) *
      pricing.inputPerMillionTokens;

    const outputCost =
      (usage.outputTokens /
        1_000_000) *
      pricing.outputPerMillionTokens;

    const actualCost =
      inputCost + outputCost;

    this.spentUsd += actualCost;

    return actualCost;
  }
}
