export class ExactMatchEvaluator {
    caseSensitive;
    name = "exact-match";
    constructor(caseSensitive = false) {
        this.caseSensitive = caseSensitive;
    }
    async evaluate(expected, actual) {
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
