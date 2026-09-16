import type { AgentState, StateEvent } from "./state.js";

export class ConcurrencyConflictError extends Error {
  constructor(
    public readonly expectedRevision: number,
    public readonly actualRevision: number,
    message?: string
  ) {
    super(
      message ||
        `Optimistic Concurrency Conflict: Expected state revision ${expectedRevision}, but state was at revision ${actualRevision}`
    );
    this.name = "ConcurrencyConflictError";
  }
}

/**
 * Promise-based FIFO Async Mutex to serialize concurrent updates to shared state.
 */
export class AsyncMutex {
  private queue: Array<(release: () => void) => void> = [];
  private locked = false;

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const run = () => {
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.locked = false;
          const next = this.queue.shift();
          if (next) {
            this.locked = true;
            next(this.createRelease());
          }
        });
      };

      if (!this.locked) {
        this.locked = true;
        resolve(this.createRelease());
      } else {
        this.queue.push(run);
      }
    });
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.locked = false;
      const next = this.queue.shift();
      if (next) {
        this.locked = true;
        next(this.createRelease());
      }
    };
  }

  /**
   * Run an asynchronous or synchronous operation inside a critical section
   */
  async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/**
 * Transactional State Manager managing shared AgentState with Mutex locks and OCC.
 */
export class TransactionalStateManager {
  private mutex = new AsyncMutex();
  private state: AgentState;

  constructor(initialState: AgentState) {
    this.state = initialState;
  }

  /**
   * Get an immutable snapshot of the current state.
   */
  getSnapshot(): Readonly<AgentState> {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Get current revision number.
   */
  getRevision(): number {
    return this.state.revision;
  }

  /**
   * Execute an atomic mutation on the shared state protected by mutex.
   */
  async atomicMutate<T>(
    actor: string,
    eventType: StateEvent["type"],
    mutator: (state: AgentState) => T
  ): Promise<{ result: T; revision: number }> {
    return this.mutex.runExclusive(() => {
      const result = mutator(this.state);
      this.state.revision += 1;

      const event: StateEvent = {
        eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        type: eventType,
        actor,
        payload: typeof result === "object" && result !== null ? (result as Record<string, unknown>) : { result },
        revision: this.state.revision
      };

      this.state.events.push(event);

      return { result, revision: this.state.revision };
    });
  }

  /**
   * Optimistic Concurrency Control mutation:
   * Throws ConcurrencyConflictError if revision has changed since worker read it.
   */
  async mutateWithOCC<T>(
    expectedRevision: number,
    actor: string,
    eventType: StateEvent["type"],
    mutator: (state: AgentState) => T
  ): Promise<{ result: T; revision: number }> {
    return this.mutex.runExclusive(() => {
      if (this.state.revision !== expectedRevision) {
        throw new ConcurrencyConflictError(expectedRevision, this.state.revision);
      }

      const result = mutator(this.state);
      this.state.revision += 1;

      const event: StateEvent = {
        eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        type: eventType,
        actor,
        payload: typeof result === "object" && result !== null ? (result as Record<string, unknown>) : { result },
        revision: this.state.revision
      };

      this.state.events.push(event);

      return { result, revision: this.state.revision };
    });
  }
}
