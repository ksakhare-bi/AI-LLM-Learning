import {
  StructureAwareChunker
} from "./ingestion/chunker.js";

import type {
  SourceDocument
} from "./ingestion/types.js";

import {
  DenseRetriever
} from "./retrieval/dense-retriever.js";

import {
  BM25Retriever
} from "./retrieval/sparse-retriever.js";

const document: SourceDocument = {

  id: "employee-handbook",

  title: "Employee Handbook",

  sections: [

    {
      heading: "Leave Policy",

      content:
        "Employees are eligible for 26 weeks of parental leave. Employees must notify their manager at least 30 days before the expected leave date. Annual leave is available for 20 working days per year."
    },

    {
      heading: "Remote Work",

      content:
        "Employees may work remotely up to three days per week. Remote work must be approved by the employee's manager."
    },

    {
      heading: "Security",

      content:
        "Employees must use multi-factor authentication. Company credentials must never be shared with another person."
    }
  ]
};

const chunker =
  new StructureAwareChunker({
    maxCharacters: 180
  });

const chunks =
  chunker.chunk(document);

const denseRetriever =
  new DenseRetriever(chunks);

const sparseRetriever =
  new BM25Retriever(chunks);

const query =
  "How much parental leave can an employee take?";

console.log(
  "\n=== DENSE RESULTS ==="
);

console.log(
  denseRetriever
    .search(query, 3)
    .map((result) => ({
      score: result.score,
      section:
        result.chunk.metadata.section,
      content:
        result.chunk.content
    }))
);

console.log(
  "\n=== BM25 RESULTS ==="
);

console.log(
  sparseRetriever
    .search(query, 3)
    .map((result) => ({
      score: result.score,
      section:
        result.chunk.metadata.section,
      content:
        result.chunk.content
    }))
);
