import { RunnableLambda, RunnableParallel, RunnableSequence } from "@langchain/core/runnables";
// ============================================================================
// 1. Query Rewriter / Expansion (Synonym Normalization)
// ============================================================================
export const DEFAULT_SYNONYMS = {
    wfh: "remote work telecommuting work from home",
    pto: "paid time off annual leave vacation",
    mfa: "multi-factor authentication two-factor 2fa security credentials",
    stipend: "allowance subsidy reimbursement reimbursement policy",
    paternity: "parental leave maternity parental benefit",
    maternity: "parental leave paternity parental benefit",
    carryover: "leave carry over forfeiture rollover accumulated days",
};
export function rewriteQuery(query, synonyms = DEFAULT_SYNONYMS) {
    let rewritten = query.trim();
    for (const [acronym, expansion] of Object.entries(synonyms)) {
        const regex = new RegExp(`\\b${acronym}\\b`, "gi");
        if (regex.test(rewritten)) {
            rewritten = `${rewritten} ${expansion}`;
        }
    }
    return rewritten.replace(/\s+/g, " ").trim();
}
export const queryRewriterRunnable = RunnableLambda.from((input) => {
    return {
        ...input,
        transformedQuery: rewriteQuery(input.query),
    };
}).withConfig({ runName: "QueryRewriterRunnable" });
// ============================================================================
// 2. Dense Semantic Retriever
// ============================================================================
export class DenseRetriever {
    chunks;
    constructor(chunks) {
        this.chunks = chunks;
    }
    search(query, limit) {
        const queryTerms = this.tokenize(query);
        const results = this.chunks.map((chunk) => {
            const docTerms = this.tokenize(chunk.content);
            const score = this.similarity(queryTerms, docTerms);
            return { chunk, score, stage: "dense" };
        });
        return results.sort((a, b) => b.score - a.score).slice(0, limit);
    }
    tokenize(text) {
        return new Set(text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter(Boolean));
    }
    similarity(a, b) {
        if (a.size === 0 || b.size === 0)
            return 0;
        let intersect = 0;
        for (const term of a) {
            if (b.has(term))
                intersect++;
        }
        const union = new Set([...a, ...b]).size;
        return intersect / union;
    }
}
// ============================================================================
// 3. Sparse BM25 Retriever
// ============================================================================
export class BM25Retriever {
    chunks;
    k1 = 1.2;
    b = 0.75;
    constructor(chunks) {
        this.chunks = chunks;
    }
    search(query, limit) {
        const queryTerms = this.tokenize(query);
        const docLengths = this.chunks.map((c) => this.tokenize(c.content).length);
        const avgLen = docLengths.length === 0 ? 0 : docLengths.reduce((a, b) => a + b, 0) / docLengths.length;
        const results = this.chunks.map((chunk) => {
            const terms = this.tokenize(chunk.content);
            const score = this.scoreDoc(queryTerms, terms, avgLen);
            return { chunk, score, stage: "bm25" };
        });
        return results.sort((a, b) => b.score - a.score).slice(0, limit);
    }
    scoreDoc(qTerms, dTerms, avgLen) {
        if (qTerms.length === 0 || dTerms.length === 0 || avgLen === 0)
            return 0;
        const docLen = dTerms.length;
        const tf = new Map();
        for (const t of dTerms) {
            tf.set(t, (tf.get(t) ?? 0) + 1);
        }
        let score = 0;
        for (const term of new Set(qTerms)) {
            const termCount = tf.get(term) ?? 0;
            if (termCount === 0)
                continue;
            const df = this.chunks.filter((c) => this.tokenize(c.content).includes(term)).length;
            const totalDocs = this.chunks.length;
            const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
            const normTf = (termCount * (this.k1 + 1)) / (termCount + this.k1 * (1 - this.b + this.b * (docLen / avgLen)));
            score += idf * normTf;
        }
        return score;
    }
    tokenize(text) {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter(Boolean);
    }
}
// ============================================================================
// 4. Reciprocal Rank Fusion (RRF)
// ============================================================================
export function reciprocalRankFusion(dense, sparse, k = 60) {
    const scores = new Map();
    dense.forEach((res, rank) => {
        const existing = scores.get(res.chunk.id) ?? { chunk: res.chunk, score: 0 };
        existing.score += 1 / (k + rank + 1);
        scores.set(res.chunk.id, existing);
    });
    sparse.forEach((res, rank) => {
        const existing = scores.get(res.chunk.id) ?? { chunk: res.chunk, score: 0 };
        existing.score += 1 / (k + rank + 1);
        scores.set(res.chunk.id, existing);
    });
    return Array.from(scores.values())
        .map((item) => ({
        chunk: item.chunk,
        score: item.score,
        stage: "rrf_fusion",
    }))
        .sort((a, b) => b.score - a.score);
}
// ============================================================================
// 5. Cross-Encoder Re-Ranker
// ============================================================================
export class CrossEncoderReranker {
    rerank(query, candidates, limit) {
        const scored = candidates.map((candidate) => ({
            chunk: candidate.chunk,
            score: this.scoreCrossInteraction(query, candidate.chunk),
            stage: "cross_encoder_rerank",
        }));
        const sorted = scored.sort((a, b) => b.score - a.score);
        return limit !== undefined ? sorted.slice(0, limit) : sorted;
    }
    scoreCrossInteraction(query, chunk) {
        const cleanQuery = query.toLowerCase().trim();
        const cleanContent = chunk.content.toLowerCase();
        const cleanSection = (chunk.metadata.section || "").toLowerCase();
        const cleanTitle = (chunk.metadata.title || "").toLowerCase();
        const queryTokens = cleanQuery
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((t) => t.length > 1);
        if (queryTokens.length === 0)
            return 0;
        // 1. Term Coverage Ratio
        const matched = queryTokens.filter((token) => cleanContent.includes(token));
        const coverageScore = matched.length / queryTokens.length;
        // 2. Phrase Matching (Bigrams)
        let phraseMatches = 0;
        let totalBigrams = 0;
        for (let i = 0; i < queryTokens.length - 1; i++) {
            totalBigrams++;
            const bigram = `${queryTokens[i]} ${queryTokens[i + 1]}`;
            if (cleanContent.includes(bigram))
                phraseMatches++;
        }
        const phraseScore = totalBigrams > 0 ? (phraseMatches / totalBigrams) * 0.35 : 0;
        // 3. Section Header Boost
        let sectionScore = 0;
        const headerTokens = `${cleanTitle} ${cleanSection}`;
        const headerHits = queryTokens.filter((t) => headerTokens.includes(t)).length;
        if (headerHits > 0) {
            sectionScore = (headerHits / queryTokens.length) * 0.2;
        }
        // 4. Exact Query Substring Bonus
        let exactScore = 0;
        if (cleanContent.includes(cleanQuery)) {
            exactScore = 0.25;
        }
        // 5. Keyword Proximity
        let proximityScore = 0;
        if (matched.length >= 2) {
            const firstPos = cleanContent.indexOf(matched[0]);
            const lastPos = cleanContent.lastIndexOf(matched[matched.length - 1]);
            if (firstPos !== -1 && lastPos !== -1 && lastPos >= firstPos) {
                const span = lastPos - firstPos;
                if (span < 200) {
                    proximityScore = 0.2 * (1 - span / 200);
                }
            }
        }
        const raw = coverageScore * 0.4 + phraseScore + sectionScore + exactScore + proximityScore;
        return Math.min(1.0, Math.max(0.0, raw));
    }
}
// ============================================================================
// 6. Context Formatter with Lost-in-the-Middle Ordering
// ============================================================================
export function reorderLostInTheMiddle(items) {
    if (items.length <= 2)
        return items;
    // Distribute items so highest scoring chunks are placed at start and end
    const reordered = new Array(items.length);
    let head = 0;
    let tail = items.length - 1;
    items.forEach((item, index) => {
        if (index % 2 === 0) {
            reordered[head++] = item;
        }
        else {
            reordered[tail--] = item;
        }
    });
    return reordered;
}
export function formatContextString(results) {
    const reordered = reorderLostInTheMiddle(results);
    const sources = [];
    const contextText = reordered
        .map((res, index) => {
        const chunk = res.chunk;
        sources.push({
            id: chunk.id,
            title: chunk.metadata.title,
            section: chunk.metadata.section,
            snippet: chunk.content,
            relevanceScore: Number(res.score.toFixed(4)),
        });
        return `[Citation ${index + 1} | Source ID: ${chunk.id} | Section: ${chunk.metadata.section}]\n${chunk.content}`;
    })
        .join("\n\n---\n\n");
    return { contextText, sources };
}
// ============================================================================
// 7. LCEL Runnables Factory
// ============================================================================
export function createLCELRetrievalPipeline(chunks, options = {}) {
    const candidatePoolSize = options.candidatePoolSize ?? 10;
    const topK = options.topK ?? 3;
    const denseRetriever = new DenseRetriever(chunks);
    const sparseRetriever = new BM25Retriever(chunks);
    const reranker = new CrossEncoderReranker();
    // Dense Runnable
    const denseRunnable = RunnableLambda.from((input) => denseRetriever.search(input.transformedQuery, candidatePoolSize)).withConfig({ runName: "DenseRetrieverRunnable" });
    // Sparse Runnable
    const sparseRunnable = RunnableLambda.from((input) => sparseRetriever.search(input.transformedQuery, candidatePoolSize)).withConfig({ runName: "SparseBM25RetrieverRunnable" });
    // Parallel Search
    const parallelSearch = RunnableParallel.from({
        denseResults: denseRunnable,
        sparseResults: sparseRunnable,
    }).withConfig({ runName: "ParallelRetrievalStep" });
    // Fusion & Re-Ranking Sequence
    return RunnableSequence.from([
        queryRewriterRunnable,
        RunnableLambda.from(async (state) => {
            const searchOut = await parallelSearch.invoke({ transformedQuery: state.transformedQuery });
            const fused = reciprocalRankFusion(searchOut.denseResults, searchOut.sparseResults, 60);
            const reranked = reranker.rerank(state.transformedQuery, fused, topK);
            const { contextText, sources } = formatContextString(reranked);
            return {
                query: state.query,
                transformedQuery: state.transformedQuery,
                retrievedResults: reranked,
                contextText,
                sources,
            };
        }).withConfig({ runName: "HybridFusionAndRerankStep" }),
    ]);
}
