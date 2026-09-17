import type { SourceDocument, DocumentChunk, LabeledEvaluationQuery } from "./types.js";

export const enterpriseCorpus: SourceDocument = {
  id: "corp-handbook-2026",
  title: "Enterprise Policies and Technical SOPs",
  sections: [
    {
      heading: "Parental Leave & Family Support",
      content:
        "Employees are eligible for 26 weeks of fully paid parental leave. " +
        "Employees must provide formal written notification to their direct manager at least 30 days prior to the expected leave date. " +
        "Leave applies equally to primary and secondary caregivers.",
      metadata: { section: "Parental Leave & Family Support", version: 1 },
    },
    {
      heading: "Annual Vacation & Leave Rollover",
      content:
        "Full-time staff receive 20 annual leave days per fiscal year. " +
        "A maximum of 5 unused leave days can be carried over into the following year. " +
        "Any accumulated leave exceeding the 5-day rollover threshold is permanently forfeited on December 31st.",
      metadata: { section: "Annual Vacation & Leave Rollover", version: 1 },
    },
    {
      heading: "Remote Work & Home Office Equipment Subsidy",
      content:
        "Employees approved for telecommuting may work remotely up to three days per calendar week. " +
        "A one-time home office equipment subsidy of $750 is provided for remote ergonomics, desks, and monitors. " +
        "Remote work schedules require quarterly operational manager approval.",
      metadata: { section: "Remote Work & Home Office Equipment Subsidy", version: 1 },
    },
    {
      heading: "Security Authentication & Credentials Standard",
      content:
        "All engineers and staff must enforce hardware token multi-factor authentication (MFA). " +
        "Company access credentials must never be shared under any circumstances. " +
        "Any suspected credential leakage triggers immediate incident ERR_AUTH_MFA_092 and credential revocation.",
      metadata: { section: "Security Authentication & Credentials Standard", version: 1 },
    },
    {
      heading: "Travel Per-Diem & Expense Reimbursement 2026",
      content:
        "Effective January 2026, the domestic business travel per-diem allowance is updated to $95 per day. " +
        "The legacy 2024 per-diem rate of $65 per day is completely deprecated and void. " +
        "Receipts must be submitted within 14 calendar days of travel completion.",
      metadata: { section: "Travel Per-Diem & Expense Reimbursement 2026", version: 2 },
    },
  ],
};

export const heldOutQueries: LabeledEvaluationQuery[] = [
  {
    id: "eval-01",
    query: "What is the WFH equipment stipend allowance?",
    relevantChunkIds: ["corp-handbook-2026-2"], // Home Office Equipment Subsidy
    notes: "Acronym/synonym challenge: 'WFH equipment stipend' -> 'Remote Home Office Equipment Subsidy'",
  },
  {
    id: "eval-02",
    query: "How many days advance notice must be given for parental leave and how many weeks?",
    relevantChunkIds: ["corp-handbook-2026-0"], // Parental leave
    notes: "Multi-constraint numerical check: 30 days notice + 26 weeks",
  },
  {
    id: "eval-03",
    query: "What happens during ERR_AUTH_MFA_092 credential leakage?",
    relevantChunkIds: ["corp-handbook-2026-5"], // Security incident ERR_AUTH_MFA_092
    notes: "Exact error code matching: ERR_AUTH_MFA_092",
  },
  {
    id: "eval-04",
    query: "What are the rules on leave carryover and forfeiture?",
    relevantChunkIds: ["corp-handbook-2026-1"], // Annual leave rollover forfeiture
    notes: "Distinguishes rollover forfeiture vs parental leave",
  },
  {
    id: "eval-05",
    query: "What is the active 2026 travel per-diem reimbursement rate?",
    relevantChunkIds: ["corp-handbook-2026-6"], // Travel per diem 2026
    notes: "Temporal versioning: 2026 ($95) vs deprecated 2024 ($65)",
  },
];

export function chunkCorpus(document: SourceDocument, maxCharacters = 250): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  for (const section of document.sections) {
    const parts = splitContent(section.content, maxCharacters);
    for (const part of parts) {
      chunks.push({
        id: `${document.id}-${chunkIndex}`,
        documentId: document.id,
        content: part,
        metadata: {
          title: document.title,
          section: section.heading,
          chunkIndex,
          version: (section.metadata?.version as number) ?? 1,
        },
      });
      chunkIndex++;
    }
  }

  return chunks;
}

function splitContent(content: string, maxCharacters: number): string[] {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxCharacters) {
    return [normalized];
  }

  const sentences = normalized.match(/[^.!?]+[.!?]+/g) ?? [normalized];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence.trim()}` : sentence.trim();
    if (candidate.length > maxCharacters) {
      if (current) {
        chunks.push(current);
      }
      current = sentence.trim();
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export const defaultCorpusChunks = chunkCorpus(enterpriseCorpus);
