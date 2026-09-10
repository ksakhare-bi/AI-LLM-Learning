export class SchemaValidityEvaluator {
    schema;
    name = "schema-validity";
    constructor(schema) {
        this.schema = schema;
    }
    async evaluate(_input, output) {
        let target = output;
        if (typeof output === "string") {
            try {
                target = JSON.parse(output);
            }
            catch (e) {
                return {
                    passed: false,
                    score: 0.0,
                    reason: "Output is not valid JSON string"
                };
            }
        }
        const result = this.schema.safeParse(target);
        if (result.success) {
            return {
                passed: true,
                score: 1.0,
                reason: "Schema validation passed"
            };
        }
        return {
            passed: false,
            score: 0.0,
            reason: `Schema validation failed: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`
        };
    }
}
