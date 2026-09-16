import type { QueryTransformationContext } from "./types.js";

export const DEFAULT_SYNONYM_EXPANSIONS: Record<string, string> = {
  wfh: "remote work telecommuting work from home",
  pto: "paid time off annual leave vacation",
  mfa: "multi-factor authentication two-factor 2fa security credentials",
  stipend: "allowance subsidy reimbursement reimbursement policy",
  paternity: "parental leave maternity parental benefit",
  maternity: "parental leave paternity parental benefit",
  carryover: "leave carry over forfeiture rollover accumulated days",
};

export class QueryRewriter {
  private readonly synonymMap: Record<string, string>;

  constructor(customSynonyms?: Record<string, string>) {
    this.synonymMap = { ...DEFAULT_SYNONYM_EXPANSIONS, ...customSynonyms };
  }

  rewrite(query: string, context?: QueryTransformationContext): string {
    let rewritten = query.trim();

    // 1. Resolve coreference / pronouns from conversation history if present
    if (context?.conversationHistory && context.conversationHistory.length > 0) {
      rewritten = this.resolveCoreferences(rewritten, context.conversationHistory);
    }

    // 2. Expand common acronyms & synonyms
    for (const [acronym, expansion] of Object.entries(this.synonymMap)) {
      const regex = new RegExp(`\\b${acronym}\\b`, "gi");
      if (regex.test(rewritten)) {
        rewritten = `${rewritten} ${expansion}`;
      }
    }

    // Clean extra whitespace
    return rewritten.replace(/\s+/g, " ").trim();
  }

  private resolveCoreferences(
    query: string,
    history: Array<{ role: string; content: string }>
  ): string {
    const pronounRegex = /\b(it|this|that|they|them)\b/i;
    if (!pronounRegex.test(query)) {
      return query;
    }

    // Find the last user or assistant message that mentioned a salient topic
    for (let i = history.length - 1; i >= 0; i--) {
      const content = history[i].content;
      const topicMatch = content.match(
        /\b(parental leave|remote work|security policy|annual leave|travel reimbursement|mfa)\b/i
      );
      if (topicMatch) {
        return query.replace(pronounRegex, topicMatch[0]);
      }
    }

    return query;
  }
}
