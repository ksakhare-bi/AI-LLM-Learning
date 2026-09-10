export interface ModelPricing {
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "demo-model": {
    inputPerMillionTokens: 1,
    outputPerMillionTokens: 2
  },
  // OpenAI Models (Prices in USD per 1M tokens)
  "gpt-4o": {
    inputPerMillionTokens: 2.5,
    outputPerMillionTokens: 10.0
  },
  "gpt-4o-mini": {
    inputPerMillionTokens: 0.15,
    outputPerMillionTokens: 0.6
  },
  // Anthropic Models
  "claude-3-5-sonnet": {
    inputPerMillionTokens: 3.0,
    outputPerMillionTokens: 15.0
  },
  "claude-3-haiku": {
    inputPerMillionTokens: 0.25,
    outputPerMillionTokens: 1.25
  },
  // Google Gemini Models
  "gemini-1.5-pro": {
    inputPerMillionTokens: 1.25,
    outputPerMillionTokens: 5.0
  },
  "gemini-1.5-flash": {
    inputPerMillionTokens: 0.075,
    outputPerMillionTokens: 0.3
  }
};

export function getModelPricing(model: string): ModelPricing {
  const pricing = MODEL_PRICING[model];

  if (!pricing) {
    // Default fallback to prevent crashing on custom/mock models
    return {
      inputPerMillionTokens: 1.0,
      outputPerMillionTokens: 2.0
    };
  }

  return pricing;
}
