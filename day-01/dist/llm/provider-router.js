import { CircuitBreaker } from "./circuit-breaker.js";
import { classifyLLMError } from "./error-classifier.js";
export class ProviderRouter {
    name = "provider-router";
    providers;
    onFallback;
    constructor(providers, config) {
        this.onFallback = config.onFallback;
        this.providers = providers.map(({ name, provider }) => ({
            name,
            provider,
            circuitBreaker: new CircuitBreaker(config)
        }));
    }
    getProviders() {
        return this.providers;
    }
    async generate(request, signal, context) {
        let lastError;
        for (let i = 0; i < this.providers.length; i++) {
            const entry = this.providers[i];
            const nextEntry = this.providers[i + 1];
            try {
                const response = await entry.circuitBreaker.execute(() => entry.provider.generate(request, signal, context));
                return {
                    ...response,
                    providerName: entry.name
                };
            }
            catch (error) {
                lastError = error;
                const classified = classifyLLMError(error);
                // Never blindly fallback if the error is non-retryable (e.g. invalid request, 400, schema error).
                // A bad prompt or invalid schema will fail across all providers equally.
                if (!classified.retryable) {
                    throw classified;
                }
                // If there's another provider in the fallback chain, notify and continue
                if (nextEntry) {
                    if (context?.onFallback) {
                        context.onFallback(entry.name, nextEntry.name, error);
                    }
                    if (this.onFallback) {
                        this.onFallback(entry.name, nextEntry.name, error);
                    }
                    else if (!context?.onFallback) {
                        console.warn(`[ProviderRouter] Provider '${entry.name}' failed (${classified.message}). Falling back to '${nextEntry.name}'...`);
                    }
                }
            }
        }
        throw (lastError ??
            new Error("All LLM providers in fallback chain failed"));
    }
}
