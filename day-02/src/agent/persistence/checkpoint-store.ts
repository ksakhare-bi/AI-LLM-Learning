import type { AgentState } from "../../config/types.js";

export interface CheckpointStore {
  save(state: AgentState): Promise<void>;

  load(runId: string): Promise<AgentState | null>;

  delete(runId: string): Promise<void>;
}