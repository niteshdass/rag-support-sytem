import { eq } from 'drizzle-orm';
import { type Db } from '../../db/client.js';
import { chunks, documents, type NewChunk } from '../../db/schema.js';
import { logger } from '../../logger.js';

const CHARS_PER_TOKEN = 4;

export async function storeChunks(
  orgId: string,
  documentId: string,
  chunkTexts: string[],
  embeddings: number[][],
  database: Db
): Promise<void> {
  try {
    await database.transaction(async (tx) => {
      const newChunks: NewChunk[] = chunkTexts.map((content, index) => ({
        organizationId: orgId,
        documentId,
        content,
        embedding: embeddings[index] ?? [],
        tokenCount: Math.ceil(content.length / CHARS_PER_TOKEN),
        chunkIndex: index,
      }));

      await tx.insert(chunks).values(newChunks);

      await tx
        .update(documents)
        .set({ status: 'ready', updatedAt: new Date() })
        .where(eq(documents.id, documentId));
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    try {
      await database
        .update(documents)
        .set({ status: 'failed', error: errorMessage, updatedAt: new Date() })
        .where(eq(documents.id, documentId));
    } catch (updateErr) {
      logger.error({ updateErr, documentId }, 'Failed to mark document as failed');
    }
    throw err;
  }
}
