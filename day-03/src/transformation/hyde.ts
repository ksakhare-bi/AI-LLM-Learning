export type CustomHydeGenerator = (query: string) => Promise<string> | string;

export class HyDEGenerator {
  constructor(private readonly customGenerator?: CustomHydeGenerator) {}

  async generateHypotheticalDocument(query: string): Promise<string> {
    if (this.customGenerator) {
      return await this.customGenerator(query);
    }

    // Deterministic hypothetical document template for local test/benchmarks
    const cleanQuery = query.replace(/[?.,!]/g, "").trim();

    return (
      `Official Company Policy Document regarding ${cleanQuery}. ` +
      `This policy establishes the operational standards, employee rights, and procedures for ${cleanQuery}. ` +
      `All employees and managers must adhere to the specific guidelines, timeframes, and compliance requirements defined herein.`
    );
  }
}
