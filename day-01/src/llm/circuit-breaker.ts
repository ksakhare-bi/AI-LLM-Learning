export type CircuitState =
  | "CLOSED"
  | "OPEN"
  | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

export class CircuitBreaker {
  private state: CircuitState =
    "CLOSED";

  private failureCount = 0;

  private openedAt:
    number | null = null;

  constructor(
    private readonly config: CircuitBreakerConfig
  ) {}

  getState(): CircuitState {
    return this.state;
  }

  private transitionToOpen(): void {
    this.state = "OPEN";
    this.openedAt = Date.now();
  }

  private transitionToHalfOpen(): void {
    this.state = "HALF_OPEN";
  }

  private transitionToClosed(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.openedAt = null;
  }

  private canAttempt(): boolean {
    if (this.state !== "OPEN") {
      return true;
    }

    if (this.openedAt === null) {
      return false;
    }

    const elapsed =
      Date.now() -
      this.openedAt;

    if (
      elapsed >=
      this.config.cooldownMs
    ) {
      this.transitionToHalfOpen();
      return true;
    }

    return false;
  }

  async execute<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    if (!this.canAttempt()) {
      throw new Error(
        "Circuit breaker is OPEN"
      );
    }

    try {
      const result =
        await operation();

      if (
        this.state === "HALF_OPEN"
      ) {
        this.transitionToClosed();
      } else {
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.failureCount++;

      if (
        this.failureCount >=
        this.config.failureThreshold
      ) {
        this.transitionToOpen();
      }

      throw error;
    }
  }
}
