import assert from "node:assert";
import { ResearchSpecialist } from "../src/agents/specialists/researcher.js";
import { Supervisor } from "../src/orchestration/supervisor.js";
import type { AgentTask } from "../src/agents/types.js";

async function testHitl() {
  console.log("Running Day 4 Human-in-the-Loop (HITL) Tests...");

  const baseTask: AgentTask = {
    taskId: "hitl-test-task",
    taskType: "research_review",
    description: "Analyze market opportunities for autonomous AI agents"
  };

  // TEST 1: HITL Approval Workflow
  console.log("  [Test 1] Testing HITL Approval Workflow...");
  const supervisorApprove = new Supervisor([new ResearchSpecialist("research-agent", 50)], {
    workerTimeoutMs: 1000,
    globalTimeoutMs: 2000,
    hitlEnabled: true,
    hitlCheckpointAgentId: "research-agent"
  });

  const stateApprove = await supervisorApprove.execute(baseTask, async (checkpoint) => {
    assert.strictEqual(checkpoint.agentId, "research-agent");
    assert.strictEqual(checkpoint.status, "pending_review");
    return {
      action: "approve",
      reviewer: "lead-analyst@company.com",
      timestamp: Date.now()
    };
  });

  assert.strictEqual(stateApprove.status, "completed");
  assert.strictEqual(stateApprove.results.length, 1);
  assert.strictEqual(stateApprove.hitlCheckpoints.length, 1);
  assert.strictEqual(stateApprove.hitlCheckpoints[0].status, "approved");
  console.log("    Approval workflow passed.");

  // TEST 2: HITL Edit / Payload Mutation Workflow
  console.log("  [Test 2] Testing HITL Edit Payload Mutation Workflow...");
  const supervisorEdit = new Supervisor([new ResearchSpecialist("research-agent", 50)], {
    workerTimeoutMs: 1000,
    globalTimeoutMs: 2000,
    hitlEnabled: true,
    hitlCheckpointAgentId: "research-agent"
  });

  const stateEdit = await supervisorEdit.execute(baseTask, async (checkpoint) => {
    return {
      action: "edit",
      reviewer: "compliance-officer@company.com",
      feedback: "Overriding confidence score to reflect updated audit",
      editedData: {
        category: "Audited Enterprise AI",
        confidenceScore: 0.99,
        humanReviewed: true
      },
      timestamp: Date.now()
    };
  });

  assert.strictEqual(stateEdit.status, "completed");
  assert.strictEqual(stateEdit.results.length, 1);
  const finalData = stateEdit.results[0].data as { confidenceScore: number; humanReviewed: boolean };
  assert.strictEqual(finalData.confidenceScore, 0.99, "Edited payload was not applied");
  assert.strictEqual(finalData.humanReviewed, true);
  assert.strictEqual(stateEdit.hitlCheckpoints[0].status, "edited");
  console.log("    Edit workflow passed with verified payload modification.");

  // TEST 3: HITL Rejection Workflow
  console.log("  [Test 3] Testing HITL Rejection Workflow...");
  const supervisorReject = new Supervisor([new ResearchSpecialist("research-agent", 50)], {
    workerTimeoutMs: 1000,
    globalTimeoutMs: 2000,
    hitlEnabled: true,
    hitlCheckpointAgentId: "research-agent"
  });

  const stateReject = await supervisorReject.execute(baseTask, async (checkpoint) => {
    return {
      action: "reject",
      reviewer: "security-auditor@company.com",
      feedback: "Data leaks unapproved competitive disclosures",
      timestamp: Date.now()
    };
  });

  assert.strictEqual(stateReject.status, "partial");
  assert.strictEqual(stateReject.results.length, 0);
  assert.strictEqual(stateReject.failures.length, 1);
  assert.strictEqual(stateReject.failures[0].error?.code, "HITL_REJECTED");
  assert.ok(stateReject.failures[0].error?.message.includes("Data leaks unapproved"));
  assert.strictEqual(stateReject.hitlCheckpoints[0].status, "rejected");
  console.log("    Rejection workflow passed with failure registration.");

  // TEST 4: Asynchronous External Resume via submitDecision()
  console.log("  [Test 4] Testing Asynchronous External Resume via submitDecision()...");
  const supervisorAsync = new Supervisor([new ResearchSpecialist("research-agent", 50)], {
    workerTimeoutMs: 1000,
    globalTimeoutMs: 2000,
    hitlEnabled: true,
    hitlCheckpointAgentId: "research-agent"
  });

  // Start execution in background without inline handler
  const execPromise = supervisorAsync.execute(baseTask);

  // Poll briefly for pending checkpoint and submit human decision externally
  let checkpointFound = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 20));
    const checkpoints = supervisorAsync.hitlManager.getAllCheckpoints();
    if (checkpoints.length > 0 && checkpoints[0].status === "pending_review") {
      supervisorAsync.hitlManager.submitDecision(
        checkpoints[0].checkpointId,
        "approve",
        "external-admin@company.com"
      );
      checkpointFound = true;
      break;
    }
  }

  assert.strictEqual(checkpointFound, true, "Checkpoint was not found in pending_review status");
  const stateAsync = await execPromise;
  assert.strictEqual(stateAsync.status, "completed");
  assert.strictEqual(stateAsync.results.length, 1);
  console.log("    External asynchronous resume passed.");

  console.log("Day 4 HITL Tests Passed Successfully!\n");
}

testHitl().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
