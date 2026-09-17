import { RunnableLambda, RunnableParallel, RunnablePassthrough, RunnableSequence } from "@langchain/core/runnables";
import { z } from "zod";

async function testLCELComposition() {
  console.log("Testing LCEL composition, parallel execution, and state passthrough...");

  // 1. RunnableSequence test
  const addTen = RunnableLambda.from((n: number) => n + 10);
  const multiplyTwo = RunnableLambda.from((n: number) => n * 2);
  const sequence = addTen.pipe(multiplyTwo);

  const seqResult = await sequence.invoke(5);
  if (seqResult !== 30) {
    throw new Error(`RunnableSequence failed: expected 30, got ${seqResult}`);
  }

  // 2. RunnableParallel test
  const parallel = RunnableParallel.from({
    original: new RunnablePassthrough(),
    squared: RunnableLambda.from((n: number) => n * n),
    cubed: RunnableLambda.from((n: number) => n * n * n),
  });

  const parResult = await parallel.invoke(4);
  if (parResult.original !== 4 || parResult.squared !== 16 || parResult.cubed !== 64) {
    throw new Error(`RunnableParallel failed: ${JSON.stringify(parResult)}`);
  }

  // 3. RunnablePassthrough.assign test
  const assignChain = RunnablePassthrough.assign({
    doubled: (x: { val: number }) => x.val * 2,
    timestamp: () => 1700000000,
  });

  const assignResult = await assignChain.invoke({ val: 21 });
  if (assignResult.val !== 21 || assignResult.doubled !== 42 || assignResult.timestamp !== 1700000000) {
    throw new Error(`RunnablePassthrough.assign failed: ${JSON.stringify(assignResult)}`);
  }

  // 4. Batching test with maxConcurrency
  const batchInputs = [1, 2, 3, 4, 5];
  const batchResults = await multiplyTwo.batch(batchInputs, { maxConcurrency: 2 });
  if (JSON.stringify(batchResults) !== JSON.stringify([2, 4, 6, 8, 10])) {
    throw new Error(`Batch execution failed: ${JSON.stringify(batchResults)}`);
  }

  console.log("✓ LCEL Composition and Parallelism tests passed!");
}

testLCELComposition().catch((err) => {
  console.error("test/lcel.test.ts failed:", err);
  process.exit(1);
});
