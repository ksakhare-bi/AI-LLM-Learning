import { ShortTermMemoryBuffer } from "../src/agent/memory/short-term-buffer.js";
import { MemoryCompactor } from "../src/agent/memory/memory-compactor.js";
import { VectorMemoryStore } from "../src/agent/memory/vector-memory-store.js";
import type { LLMMessage } from "../src/config/types.js";

async function runMemoryTests() {
  console.log("=".repeat(80));
  console.log("TESTING MEMORY ARCHITECTURES: BUFFER, COMPACTION & VECTOR STORE");
  console.log("=".repeat(80));

  let passed = 0;
  let total = 0;

  // -------------------------------------------------------------------------
  // 1. ShortTermMemoryBuffer
  // -------------------------------------------------------------------------
  total++;
  try {
    const buffer = new ShortTermMemoryBuffer({ maxMessages: 4, preserveSystemMessage: true });
    buffer.add({ role: "system", content: "System instructions" });
    buffer.add({ role: "user", content: "Msg 1" });
    buffer.add({ role: "assistant", content: "Msg 2" });
    buffer.add({ role: "user", content: "Msg 3" });
    buffer.add({ role: "assistant", content: "Msg 4" }); // triggers overflow

    const messages = buffer.getMessages();
    const roles = messages.map(m => m.role);

    if (
      messages.length === 4 &&
      roles[0] === "system" &&
      messages[0].content === "System instructions" &&
      buffer.overflowCount === 1 &&
      messages[messages.length - 1].content === "Msg 4"
    ) {
      console.log("PASS [OK] Test 1: ShortTermMemoryBuffer preserved system prompt and enforced sliding window");
      passed++;
    } else {
      console.error("FAIL [X] Test 1: ShortTermMemoryBuffer failed", { messages, overflow: buffer.overflowCount });
    }
  } catch (err) {
    console.error("FAIL [X] Test 1 error:", err);
  }

  // -------------------------------------------------------------------------
  // 2. MemoryCompactor
  // -------------------------------------------------------------------------
  total++;
  try {
    const compactor = new MemoryCompactor({ thresholdCount: 5, keepRecent: 2 });
    const rawMessages: LLMMessage[] = [
      { role: "system", content: "Core System Persona" },
      { role: "user", content: "Analyze customer churn" },
      { role: "assistant", content: "Querying churn dataset" },
      { role: "tool", content: JSON.stringify({ toolName: "dbQuery", success: true, rows: 50 }) },
      { role: "assistant", content: "Found 50 high risk customers" },
      { role: "user", content: "Now export to CSV" }
    ];

    const result = await compactor.compact(rawMessages);

    if (
      result.compacted === true &&
      result.newCount < result.originalCount &&
      result.messages[0].content === "Core System Persona" &&
      result.messages[1].content.includes("[CONVERSATION COMPACTED MEMORY SUMMARY]") &&
      result.messages.slice(-1)[0].content === "Now export to CSV"
    ) {
      console.log("PASS [OK] Test 2: MemoryCompactor cleanly compacted older turns into structured summary");
      passed++;
    } else {
      console.error("FAIL [X] Test 2: MemoryCompactor failed", result);
    }
  } catch (err) {
    console.error("FAIL [X] Test 2 error:", err);
  }

  // -------------------------------------------------------------------------
  // 3. VectorMemoryStore
  // -------------------------------------------------------------------------
  total++;
  try {
    const vectorStore = new VectorMemoryStore();

    await vectorStore.store("mem_1", "User prefers dark mode and high contrast themes in their IDE.", { category: "preferences" });
    await vectorStore.store("mem_2", "Agent runaway loops are mitigated using hard step budgets and token guards.", { category: "architecture" });
    await vectorStore.store("mem_3", "The quick brown fox jumps over the lazy dog in the park.", { category: "random" });

    // Query 1: Architecture search
    const archResults = await vectorStore.search("how to prevent infinite loops and budget overruns", 2);
    // Query 2: Preference search
    const prefResults = await vectorStore.search("what visual theme does the user like?", 2);

    const topArchId = archResults[0]?.entry.id;
    const topPrefId = prefResults[0]?.entry.id;

    if (
      topArchId === "mem_2" &&
      archResults[0].score > 0.05 &&
      topPrefId === "mem_1" &&
      prefResults[0].score > 0.05
    ) {
      console.log("PASS [OK] Test 3: VectorMemoryStore performed semantic vector similarity search and ranked relevant memories");
      passed++;
    } else {
      console.error("FAIL [X] Test 3: VectorMemoryStore ranking failed", {
        archResults: archResults.map(r => ({ id: r.entry.id, score: r.score })),
        prefResults: prefResults.map(r => ({ id: r.entry.id, score: r.score }))
      });
    }
  } catch (err) {
    console.error("FAIL [X] Test 3 error:", err);
  }

  console.log("\n" + "=".repeat(80));
  console.log(`MEMORY ARCHITECTURE TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log("=".repeat(80) + "\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runMemoryTests().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
