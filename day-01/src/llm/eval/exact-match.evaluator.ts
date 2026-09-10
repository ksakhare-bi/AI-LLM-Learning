import type { Evaluator, EvalResult } from "./evaluator.interface.js";

export class ExactMatchEvaluator implements Evaluator<string, string> {
  readonly name = "exact-match";

  constructor(private readonly caseSensitive = false) {}

  async evaluate(expected: string, actual: string): Promise<EvalResult> {
    const exp = this.caseSensitive ? expected.trim() : expected.trim().toLowerCase();
    const act = this.caseSensitive ? actual.trim() : actual.trim().toLowerCase();

    const isMatch = exp === act;

    return {
      passed: isMatch,
      score: isMatch ? 1.0 : 0.0,
      reason: isMatch
        ? "Exact match verified"
        : `Mismatch: expected "${expected}" but received "${actual}"`
    };
  }
}
