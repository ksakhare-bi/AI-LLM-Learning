import type { AgentTask, AgentResult, WorkerAgent } from "../types.js";

export interface ComplianceData {
  riskScore: number; // 0 (safe) to 100 (critical)
  regulationsEvaluated: string[];
  findings: string[];
  mitigationRequired: boolean;
  clearanceStatus: "passed" | "conditional" | "blocked";
}

export class ComplianceSpecialist implements WorkerAgent<ComplianceData> {
  readonly id: string;
  readonly role = "Risk, Governance & Compliance Auditor";
  readonly capabilities = ["regulatory_audit", "gdpr_soc2_check", "liability_assessment"];

  constructor(id: string = "compliance-specialist", private readonly latencyMs: number = 350) {
    this.id = id;
  }

  async execute(
    task: AgentTask,
    signal: AbortSignal,
    sharedStateView?: Readonly<Record<string, unknown>>
  ): Promise<AgentResult<ComplianceData>> {
    const startedAt = Date.now();

    if (signal.aborted) {
      throw new Error(`Worker ${this.id} aborted before execution`);
    }

    await this.delay(this.latencyMs, signal);

    const data: ComplianceData = {
      riskScore: 18,
      regulationsEvaluated: ["EU AI Act", "GDPR Article 22", "SOC2 Type II", "HIPAA Safeguards"],
      findings: [
        "Automated decision making requires clear human oversight fallback (addressed by HITL)",
        "Audit trail for all inter-agent state modifications must be persisted",
        "Data minimization applied to cross-agent payload contracts"
      ],
      mitigationRequired: false,
      clearanceStatus: "passed"
    };

    return {
      taskId: task.taskId,
      agentId: this.id,
      status: "success",
      data,
      usage: {
        tokens: 340,
        costUsd: 0.0034,
        durationMs: Date.now() - startedAt
      },
      timestamp: Date.now()
    };
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error("Execution aborted"));
      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("Execution aborted"));
        },
        { once: true }
      );
    });
  }
}
