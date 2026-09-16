import type {
  HitlAction,
  HitlCheckpoint,
  HitlDecision,
  AgentResult
} from "../agents/types.js";

export type HitlHandler = (checkpoint: HitlCheckpoint) => Promise<HitlDecision>;

export class HitlManager {
  private checkpoints: Map<string, HitlCheckpoint> = new Map();
  private pendingResolvers: Map<string, (decision: HitlDecision) => void> = new Map();

  /**
   * Create a review checkpoint and wait for human decision (interrupt-and-resume)
   */
  async createCheckpointAndWait(
    agentId: string,
    dataToReview: unknown,
    automatedHandler?: HitlHandler
  ): Promise<{ decision: HitlDecision; effectiveData: unknown }> {
    const checkpointId = `chk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const checkpoint: HitlCheckpoint = {
      checkpointId,
      agentId,
      timestamp: Date.now(),
      status: "pending_review",
      dataToReview
    };

    this.checkpoints.set(checkpointId, checkpoint);

    let decision: HitlDecision;

    if (automatedHandler) {
      decision = await automatedHandler(checkpoint);
      this.resolveDecision(checkpointId, decision);
    } else {
      // Wait for external async resume call
      decision = await new Promise<HitlDecision>((resolve) => {
        this.pendingResolvers.set(checkpointId, resolve);
      });
    }

    checkpoint.decision = decision;
    checkpoint.status =
      decision.action === "approve"
        ? "approved"
        : decision.action === "edit"
        ? "edited"
        : "rejected";

    let effectiveData = dataToReview;
    if (decision.action === "edit" && decision.editedData !== undefined) {
      effectiveData = decision.editedData;
    }

    return { decision, effectiveData };
  }

  /**
   * Resume an interrupted execution by submitting human feedback for a pending checkpoint
   */
  submitDecision(
    checkpointId: string,
    action: HitlAction,
    reviewer: string,
    options?: { feedback?: string; editedData?: unknown }
  ): HitlCheckpoint {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    const decision: HitlDecision = {
      action,
      reviewer,
      feedback: options?.feedback,
      editedData: options?.editedData,
      timestamp: Date.now()
    };

    this.resolveDecision(checkpointId, decision);
    return checkpoint;
  }

  private resolveDecision(checkpointId: string, decision: HitlDecision): void {
    const resolver = this.pendingResolvers.get(checkpointId);
    if (resolver) {
      this.pendingResolvers.delete(checkpointId);
      resolver(decision);
    }
  }

  getCheckpoint(checkpointId: string): HitlCheckpoint | undefined {
    return this.checkpoints.get(checkpointId);
  }

  getAllCheckpoints(): HitlCheckpoint[] {
    return Array.from(this.checkpoints.values());
  }
}
