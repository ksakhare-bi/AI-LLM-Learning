export interface TransformedQuery {
  originalQuery: string;
  rewrittenQuery?: string;
  subQueries?: string[];
  hypotheticalDocument?: string;
}

export interface QueryTransformationContext {
  conversationHistory?: Array<{ role: string; content: string }>;
  domainContext?: string;
  synonymMap?: Record<string, string[]>;
}
