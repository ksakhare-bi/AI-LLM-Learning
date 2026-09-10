import { getModelPricing } from "./pricing.js";
export function calculateCost(model, usage) {
    const pricing = getModelPricing(model);
    const inputTokensCost = (usage.inputTokens /
        1_000_000) *
        pricing.inputPerMillionTokens;
    const outputTokensCost = (usage.outputTokens /
        1_000_000) *
        pricing.outputPerMillionTokens;
    const totalTokensCost = inputTokensCost +
        outputTokensCost;
    return {
        inputTokensCost,
        outputTokensCost,
        totalTokensCost,
        currency: "USD"
    };
}
