import { CustomNode, ProcessContext } from '@inworld/runtime/graph';
import { MemorySnapshot } from '../../memories/types';
import { logger } from '../../utils/logger';

// Define locally
interface EmbeddedRecord {
  text: string;
  embedding: number[];
}

export interface RAGConfig {
    embedderComponentId: string;
    similarityThreshold: number;
    maxContextItems: number;
}

export class RAGNode extends CustomNode {
    private config: RAGConfig;

    constructor(config: RAGConfig) {
        super();
        this.config = config;
    }

    async process(context: ProcessContext, ...inputs: any[]): Promise<{ relevantMemories: string[] }> {
        // Inputs: { query: string, snapshot: MemorySnapshot }
        const input = inputs[0];
        const val = input?.value || input;
        
        const query = val.query as string;
        const snapshot = val.snapshot as MemorySnapshot;

        if (!query || !snapshot) {
            return { relevantMemories: [] };
        }

        const allMemories: EmbeddedRecord[] = [
            ...(snapshot.flashMemory || []),
            ...(snapshot.longTermMemory || [])
        ]
        .filter(m => Array.isArray(m.embedding) && m.embedding.length > 0)
        .map(m => ({ text: m.text, embedding: m.embedding }));

        if (allMemories.length === 0) {
            logger.debug('No existing memories to search');
            return { relevantMemories: [] };
        }

        // Use the embedder to embed the query
        const embedder = context.getEmbedderInterface(this.config.embedderComponentId);
        const queryEmbedding = await embedder.embed(query);

        // Cosine similarity logic
        const queryVector = Array.from(queryEmbedding || []);
        if (!queryVector.length) {
            return { relevantMemories: [] };
        }

        const matches = allMemories.map(record => {
            const similarity = this.cosineSimilarity(queryVector, record.embedding);
            return { record, similarity };
        });

        // Filter and sort
        const relevant = matches
            .filter(m => m.similarity >= this.config.similarityThreshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, this.config.maxContextItems)
            .map(m => m.record.text);

        if (relevant.length > 0) {
            logger.debug(`Found ${relevant.length} relevant memories`);
            logger.logMemory('Retrieval', relevant);
        } else {
            logger.debug('No relevant memories found');
        }

        return { relevantMemories: relevant };
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (!a.length || !b.length || a.length !== b.length) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
