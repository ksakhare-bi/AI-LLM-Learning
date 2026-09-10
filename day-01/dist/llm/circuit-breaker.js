export class CircuitBreaker {
    config;
    state = "CLOSED";
    failureCount = 0;
    openedAt = null;
    constructor(config) {
        this.config = config;
    }
    getState() {
        return this.state;
    }
    transitionToOpen() {
        this.state = "OPEN";
        this.openedAt = Date.now();
    }
    transitionToHalfOpen() {
        this.state = "HALF_OPEN";
    }
    transitionToClosed() {
        this.state = "CLOSED";
        this.failureCount = 0;
        this.openedAt = null;
    }
    canAttempt() {
        if (this.state !== "OPEN") {
            return true;
        }
        if (this.openedAt === null) {
            return false;
        }
        const elapsed = Date.now() -
            this.openedAt;
        if (elapsed >=
            this.config.cooldownMs) {
            this.transitionToHalfOpen();
            return true;
        }
        return false;
    }
    async execute(operation) {
        if (!this.canAttempt()) {
            throw new Error("Circuit breaker is OPEN");
        }
        try {
            const result = await operation();
            if (this.state === "HALF_OPEN") {
                this.transitionToClosed();
            }
            else {
                this.failureCount = 0;
            }
            return result;
        }
        catch (error) {
            this.failureCount++;
            if (this.failureCount >=
                this.config.failureThreshold) {
                this.transitionToOpen();
            }
            throw error;
        }
    }
}
