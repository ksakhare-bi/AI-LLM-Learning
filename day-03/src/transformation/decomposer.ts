export class QueryDecomposer {
  /**
   * Decomposes multi-part questions into atomic sub-queries
   */
  decompose(query: string): string[] {
    const trimmed = query.trim();

    // Look for compound connectors: " and what is ", " as well as ", " and how ", " compared to ", semicolons, multiple question marks
    const splitRegex =
      /\s+(?:and\s+(?:what|how|who|when|where|is|are|can|must)|as well as|along with|\?|;)\s+/i;

    const parts = trimmed
      .split(splitRegex)
      .map((part) => part.replace(/[?.,;]/g, "").trim())
      .filter((part) => part.length > 5);

    if (parts.length <= 1) {
      return [trimmed];
    }

    // Ensure each sub-query carries enough subject context if a clause is missing the subject
    const subjectMatch = trimmed.match(
      /\b(parental leave|remote work|annual leave|security|mfa|reimbursement)\b/i
    );
    const mainSubject = subjectMatch ? subjectMatch[0] : "";

    return parts.map((part) => {
      if (
        mainSubject &&
        !part.toLowerCase().includes(mainSubject.toLowerCase())
      ) {
        return `${part} regarding ${mainSubject}?`;
      }
      return part.endsWith("?") ? part : `${part}?`;
    });
  }
}
