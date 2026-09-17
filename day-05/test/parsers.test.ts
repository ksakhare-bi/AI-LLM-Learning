import { z } from "zod";
import { RetryableStructuredParser, extractJsonFromText, repairMalformedJson } from "../src/parsers/structured-parser.js";

async function testStructuredParsers() {
  console.log("Testing structured output parser and auto-repair mechanisms...");

  // 1. Test raw JSON extraction from markdown
  const markdownText = "Here is your output:\n```json\n{\"id\": 1, \"valid\": true}\n```\nThanks!";
  const extracted = extractJsonFromText(markdownText);
  if (extracted !== '{"id": 1, "valid": true}') {
    throw new Error(`JSON extraction failed: ${extracted}`);
  }

  // 2. Test repair of trailing commas and single quotes
  const corrupted = "{'name': 'Alice', 'roles': ['admin', 'dev', ], }";
  const repaired = repairMalformedJson(corrupted);
  const parsedRepaired = JSON.parse(repaired);
  if (parsedRepaired.name !== "Alice" || parsedRepaired.roles.length !== 2) {
    throw new Error(`Algorithmic JSON repair failed: ${repaired}`);
  }

  // 3. Test schema enforcement via RetryableStructuredParser
  const UserSchema = z.object({
    username: z.string().min(3),
    role: z.enum(["admin", "user", "guest"]),
    permissions: z.array(z.string()),
  });

  const parser = new RetryableStructuredParser(UserSchema, { maxRetries: 2 });
  const runnable = parser.toRunnable();

  const messyInput = `
Here is the user profile:
\`\`\`json
{
  'username': 'john_doe',
  'role': 'admin',
  'permissions': ['read', 'write', 'execute', ],
}
\`\`\`
`;

  const validatedUser = await runnable.invoke(messyInput);
  if (validatedUser.username !== "john_doe" || validatedUser.role !== "admin" || validatedUser.permissions.length !== 3) {
    throw new Error(`Parser runnable failed on messy input: ${JSON.stringify(validatedUser)}`);
  }

  console.log("✓ Structured Output Parser & Auto-Repair tests passed!");
}

testStructuredParsers().catch((err) => {
  console.error("test/parsers.test.ts failed:", err);
  process.exit(1);
});
