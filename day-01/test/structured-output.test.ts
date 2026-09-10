import { parseStructuredOutput } from "../src/llm/structured-output.js";
import { LeadSchema } from "../src/llm/validation.js";
import {
  LLMInvalidJSONError,
  LLMSchemaValidationError
} from "../src/llm/errors.js";
import process from "node:process";

async function testStructuredOutputHardening() {
  console.log("================================================================================");
  console.log("TESTING PRODUCTION HARDENED STRUCTURED OUTPUT ERROR HANDLING");
  console.log("================================================================================");

  let passed = 0;
  let total = 0;

  // Test 1: Valid clean JSON
  total++;
  try {
    const res = await parseStructuredOutput(
      JSON.stringify({ name: "Alice", email: "alice@example.com", company: "Acme" }),
      LeadSchema
    );
    if (res.name === "Alice" && res.email === "alice@example.com") {
      console.log("PASS [OK] Test 1: Clean JSON parsed and validated successfully");
      passed++;
    } else {
      console.error("FAIL [X] Test 1: Data mismatch");
    }
  } catch (err) {
    console.error("FAIL [X] Test 1 threw unexpected error:", err);
  }

  // Test 2: Markdown code fence extraction
  total++;
  try {
    const rawWithMarkdown = "Here is the extracted lead:\n```json\n{\n  \"name\": \"Bob\",\n  \"email\": \"bob@example.com\",\n  \"company\": \"Bob Co\"\n}\n```\nHope that helps!";
    const res = await parseStructuredOutput(rawWithMarkdown, LeadSchema);
    if (res.name === "Bob" && res.company === "Bob Co") {
      console.log("PASS [OK] Test 2: Markdown-wrapped JSON safely extracted and parsed");
      passed++;
    } else {
      console.error("FAIL [X] Test 2: Data mismatch");
    }
  } catch (err) {
    console.error("FAIL [X] Test 2 threw unexpected error:", err);
  }

  // Test 3: Invalid JSON Syntax -> Throws LLMInvalidJSONError
  total++;
  try {
    const brokenJson = "I cannot fulfill this request as JSON: { name: incomplete";
    await parseStructuredOutput(brokenJson, LeadSchema);
    console.error("FAIL [X] Test 3: Expected error but succeeded!");
  } catch (err: unknown) {
    if (err instanceof LLMInvalidJSONError) {
      console.log(`PASS [OK] Test 3: Caught typed LLMInvalidJSONError (code: ${err.code})`);
      console.log(`         Raw content preserved: "${err.rawContent?.slice(0, 30)}..."`);
      passed++;
    } else {
      console.error("FAIL [X] Test 3: Threw wrong error type:", err);
    }
  }

  // Test 4: Valid JSON, but Invalid Schema -> Throws LLMSchemaValidationError
  total++;
  try {
    const invalidEmailJson = JSON.stringify({
      name: "Charlie",
      email: "not-an-email-address",
      company: "Acme"
    });
    await parseStructuredOutput(invalidEmailJson, LeadSchema);
    console.error("FAIL [X] Test 4: Expected schema error but succeeded!");
  } catch (err: unknown) {
    if (err instanceof LLMSchemaValidationError) {
      console.log(`PASS [OK] Test 4: Caught typed LLMSchemaValidationError (code: ${err.code})`);
      console.log(`         Issue paths: ${err.issues.map((i) => i.path.join(".")).join(", ")}`);
      console.log(`         Parsed JSON preserved:`, err.parsedJson);
      passed++;
    } else {
      console.error("FAIL [X] Test 4: Threw wrong error type:", err);
    }
  }

  console.log("================================================================================");
  console.log(`Results: ${passed}/${total} tests passed!`);
  console.log("================================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

testStructuredOutputHardening().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
