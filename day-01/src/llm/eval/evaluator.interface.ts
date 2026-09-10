export interface EvalResult {
  passed: boolean;
  score: number; // 0.0 to 1.0
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface Evaluator<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  evaluate(input: TInput, output: TOutput): Promise<EvalResult>;
}

export interface TestCase<TInput = any, TExpected = any> {
  id: string;
  description: string;
  input: TInput;
  expected?: TExpected;
  evaluators: Evaluator[];
}

export interface TestResult {
  testId: string;
  description: string;
  passed: boolean;
  score: number;
  evaluations: Array<{
    evaluatorName: string;
    result: EvalResult;
  }>;
}

export interface EvalReport {
  totalTests: number;
  passed: number;
  failed: number;
  passRate: number; // percentage 0 - 100
  averageScore: number;
  results: TestResult[];
}
