import type {
  AgentTool
} from "./tool.js";

export const slowTool:
  AgentTool<void, string> = {

  name: "slowTool",

  description: "A tool that intentionally takes too long.",

  validate(input) {

    if (input !== undefined) {
      throw new Error(
        "slowTool does not accept input"
      );
    }

    return undefined;
  },

  async execute(
    _input,
    signal
  ) {

    await new Promise<void>(
      (resolve, reject) => {

        const timeout =
          setTimeout(
            resolve,
            5000
          );

        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            reject(new Error("Operation aborted"));
          },
          { once: true }
        );
      }
    );

    return "Completed";
  }
};