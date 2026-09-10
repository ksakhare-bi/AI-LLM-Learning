import { createHash } from "node:crypto";
import type { LLMRequest } from "../types.js";

export function generateCacheKey(request: LLMRequest): string {
  // Normalize and canonicalize all properties influencing LLM output b
  const canonicalObject = {
    model: request.model.trim().toLowerCase(),
    messages: request.messages.map((m) => ({
      role: m.role,
      content: m.content.trim(),
      name: m.name ?? null,
      toolCallId: m.toolCallId ?? null
    })),
    temperature: request.temperature ?? 1.0,
    maxTokens: request.maxTokens ?? null,
    tools: request.tools
      ? [...request.tools]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
          }))
      : null,
    toolChoice: request.toolChoice ?? null
  };

  const serialized = JSON.stringify(canonicalObject);
  const hash = createHash("sha256").update(serialized).digest("hex");

  return `llm:cache:${canonicalObject.model}:${hash}`;
}
