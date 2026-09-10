export class EvalRunner {
    async runSuite(cases, executionFn) {
        const results = [];
        for (const testCase of cases) {
            try {
                const actualOutput = await executionFn(testCase.input);
                const evaluations = [];
                let allPassed = true;
                let totalScore = 0;
                for (const evaluator of testCase.evaluators) {
                    const evalResult = await evaluator.evaluate(testCase.expected ?? testCase.input, actualOutput);
                    evaluations.push({
                        evaluatorName: evaluator.name,
                        result: evalResult
                    });
                    if (!evalResult.passed) {
                        allPassed = false;
                    }
                    totalScore += evalResult.score;
                }
                const avgScore = testCase.evaluators.length > 0
                    ? totalScore / testCase.evaluators.length
                    : 0;
                results.push({
                    testId: testCase.id,
                    description: testCase.description,
                    passed: allPassed,
                    score: avgScore,
                    evaluations
                });
            }
            catch (err) {
                results.push({
                    testId: testCase.id,
                    description: testCase.description,
                    passed: false,
                    score: 0.0,
                    evaluations: [
                        {
                            evaluatorName: "runtime-execution",
                            result: {
                                passed: false,
                                score: 0.0,
                                reason: err instanceof Error ? err.message : String(err)
                            }
                        }
                    ]
                });
            }
        }
        const passedCount = results.filter((r) => r.passed).length;
        const failedCount = results.length - passedCount;
        const passRate = results.length > 0 ? (passedCount / results.length) * 100 : 0;
        const totalScore = results.reduce((acc, r) => acc + r.score, 0);
        const averageScore = results.length > 0 ? totalScore / results.length : 0;
        return {
            totalTests: results.length,
            passed: passedCount,
            failed: failedCount,
            passRate: Number(passRate.toFixed(1)),
            averageScore: Number(averageScore.toFixed(3)),
            results
        };
    }
}
