import { z } from "zod";

export const ToolDefinitionSchema = z.object({
  name: z.string().nonempty(),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown())
});

export const LLMRequestSchema = z.object({
  model: z.string().nonempty(),
  
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant", "tool"]),
      content: z.string(),
      name: z.string().optional(),
      toolCallId: z.string().optional(),
      toolCalls: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          arguments: z.record(z.string(), z.unknown())
        })
      ).optional()
    })
  ).min(1),
  
  temperature: z.number().min(0).max(2).optional(),
  
  maxTokens: z.number().int().positive().optional(),

  tools: z.array(ToolDefinitionSchema).optional(),

  toolChoice: z.union([
    z.enum(["auto", "none", "required"]),
    z.object({ name: z.string() })
  ]).optional()
});

export const LeadSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  company: z.string()
});