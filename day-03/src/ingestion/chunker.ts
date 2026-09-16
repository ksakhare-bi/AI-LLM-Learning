import type {
  SourceDocument,
  DocumentChunk
} from "./types.js";

export interface ChunkerOptions {
  maxCharacters: number;
}

export class StructureAwareChunker {

  constructor(
    private readonly options: ChunkerOptions
  ) {}

  chunk(
    document: SourceDocument
  ): DocumentChunk[] {

    const chunks: DocumentChunk[] = [];

    let chunkIndex = 0;

    for (
      const section of document.sections
    ) {

      const parts =
        this.splitContent(
          section.content
        );

      for (
        const part of parts
      ) {

        chunks.push({
          id:
            `${document.id}-${chunkIndex}`,

          documentId:
            document.id,

          content:
            part,

          metadata: {
            title:
              document.title,

            section:
              section.heading,

            chunkIndex
          }
        });

        chunkIndex++;
      }
    }

    return chunks;
  }

  private splitContent(
    content: string
  ): string[] {

    const normalized = content.replace(/\s+/g, " ").trim();

    if (
      normalized.length <=
      this.options.maxCharacters
    ) {
      return [normalized];
    }

    const sentences =
      normalized.match(
        /[^.!?]+[.!?]+/g
      ) ?? [normalized];

    const chunks: string[] = [];

    let current = "";

    for (
      const sentence of sentences
    ) {

      const candidate =
        current
          ? `${current} ${sentence.trim()}`
          : sentence.trim();

      if (
        candidate.length >
        this.options.maxCharacters
      ) {

        if (current) {
          chunks.push(current);
        }

        current =
          sentence.trim();

      } else {
        current = candidate;
      }
    }

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }
}
