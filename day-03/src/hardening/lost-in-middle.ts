import type { RetrievalResult } from "../retrieval/types.js";

/**
 * Re-orders retrieved chunks to counteract the "Lost in the Middle" attention degradation.
 * Language models attend most effectively to the very beginning and very end of the prompt context.
 *
 * Given chunks ranked [1, 2, 3, 4, 5]:
 * Reorders to: [Rank 1, Rank 3, Rank 5, Rank 4, Rank 2]
 * So:
 * - Position 0: Highest relevance (Rank 1)
 * - Position Last: Second highest relevance (Rank 2)
 * - Deep middle: Lower relevance chunks (Rank 4, 5)
 */
export function reorderForBoundaryAttention(
  results: RetrievalResult[]
): RetrievalResult[] {
  if (results.length <= 2) {
    return [...results];
  }

  const reordered: RetrievalResult[] = new Array(results.length);
  let left = 0;
  let right = results.length - 1;

  for (let i = 0; i < results.length; i++) {
    if (i % 2 === 0) {
      reordered[left] = results[i];
      left++;
    } else {
      reordered[right] = results[i];
      right--;
    }
  }

  return reordered;
}
