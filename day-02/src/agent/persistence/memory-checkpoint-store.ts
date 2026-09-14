import type { AgentState } from "../../config/types.js";
import type { CheckpointStore } from "./checkpoint-store.js";

export class MemoryCheckpointStore implements CheckpointStore {

  private readonly checkpoints = new Map<string, AgentState>();

  async save(state: AgentState): Promise<void> {

    /*
     * Store a snapshot rather than
     * the same mutable object.
     */
    const snapshot = structuredClone(state);

    this.checkpoints.set(state.runId, snapshot);
  }


  async load(runId: string): Promise<AgentState | null> {

    const state = this.checkpoints.get(runId);

    if (!state) {
      return null;
    }

    /*
     * Return another copy so callers
     * cannot accidentally mutate the
     * stored checkpoint.
     */
    return structuredClone(state);
  }


  async delete(
    runId: string
  ): Promise<void> {

    this.checkpoints.delete(
      runId
    );
  }
}