import type { AgentTool } from "./tool.js";
import { ToolValidationError } from "./tool-validation-error.js";

interface CalculatorInput {
  a: number;
  b: number;
}

export const calculatorTool: AgentTool<CalculatorInput, number> = {
  name: "calculator",

  description: "Adds two numbers.",
  
  validate(input) {
    if (
      typeof input !== "object" ||
      input === null
    ) {
      throw new ToolValidationError("calculator", "Input must be an object.");
    }

    const data = input as Record<string, unknown>;

    if (typeof data.a !== "number") {
      throw new ToolValidationError("calculator", "Field 'a' must be a number.");
    }

    if (typeof data.b !== "number") {
      throw new ToolValidationError("calculator", "Field 'b' must be a number.");
    }

    return {
      a: data.a,
      b: data.b
    };
  },

  async execute(input, _signal) {
    return input.a + input.b;
  }
};