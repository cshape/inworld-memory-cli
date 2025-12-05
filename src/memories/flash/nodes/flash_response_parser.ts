import { CustomNode, ProcessContext } from '@inworld/runtime/graph';
import { FlashMemoryConfig, MemoryRecord, MemorySnapshot } from '../../types';
import { logger } from '../../../utils/logger';

// Helper for cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
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

const FACT_TOPIC_REGEX = /Fact:\s*([\s\S]*?)\s*\.?\s*Topic:\s*(.*?)(?=\s-\sFact:|\n|$)/gi;

export interface FlashResponseParserConfig extends FlashMemoryConfig {
  embedderComponentId: string;
}

export class FlashResponseParserNode extends CustomNode {
  private config: FlashResponseParserConfig;

  constructor(config: FlashResponseParserConfig) {
    super();
    this.config = config;
  }

  async process(context: ProcessContext, ...inputs: any[]): Promise<{ memoryRecords: MemoryRecord[] }> {
    const input = inputs[0];
    // Handle wrapped values or direct LLM response
    // LLMChatResponse or string content? usually LLMChatResponse or similar structure
    const response = input?.value || input;
    
    // Extract content
    const content = this.extractContent(response);
    
    if (!content || content.includes('NO_OP_SKIP_TURN')) {
        return { memoryRecords: [] };
    }

    // Parse
    const parsed = this.parseOutput(content);
    if (parsed.length === 0) return { memoryRecords: [] };

    // Embed
    const embedder = context.getEmbedderInterface(this.config.embedderComponentId);
    const texts = parsed.map(p => p.text);
    const embeddings = await embedder.embedBatch(texts);

    const records: MemoryRecord[] = parsed.map((p, i) => ({
        text: p.text,
        embedding: Array.from(embeddings[i]),
        topics: p.topics,
        createdAt: Date.now()
    }));

    // Deduplicate
    const filtered = this.filterBySimilarity(records);

    if (filtered.length > 0) {
        logger.logMemory('Flash Created', filtered);
    } else {
        logger.debug('No new Flash memories created after parsing');
    }

    return { memoryRecords: filtered };
  }

  private extractContent(response: any): string {
    if (typeof response === 'string') return response;
    if (response?.content) return response.content;
    // Add more checks if needed (choices[0].message.content etc)
    return '';
  }

  private parseOutput(output: string): Array<{ text: string; topics: string[] }> {
      // Copied logic from original
      const records: Array<{ text: string; topics: string[] }> = [];
      const normalized = output.replace(/\s+/g, ' ').trim();

      try {
          const cleanOutput = output.replace(/```json|```/g, '').trim();
          const jsonOutput = JSON.parse(cleanOutput);
          const items = Array.isArray(jsonOutput) ? jsonOutput : [jsonOutput];
          for (const item of items) {
            if (item.important && item.memory && item.memory.length > 0) {
                records.push({
                    text: item.memory,
                    topics: item.topic && item.topic !== 'n/a' ? [item.topic] : []
                });
            }
          }
          return records;
      } catch (e) {
          // Regex fallback
          let match;
          FACT_TOPIC_REGEX.lastIndex = 0;
          while ((match = FACT_TOPIC_REGEX.exec(normalized)) !== null && records.length < (this.config.maxFlashMemory || 4)) {
              records.push({
                  text: match[1].trim(),
                  topics: [match[2].trim()]
              });
          }
      }
      return records;
  }

  private filterBySimilarity(records: MemoryRecord[]): MemoryRecord[] {
      if (records.length === 0) return records;
      const filtered: MemoryRecord[] = [];
      
      for (let i = 0; i < records.length; i++) {
          let shouldInclude = true;
          for (let j = i + 1; j < records.length; j++) {
              if (cosineSimilarity(records[i].embedding, records[j].embedding) >= (this.config.similarityThreshold || 0.9)) {
                  shouldInclude = false;
                  break;
              }
          }
          if (shouldInclude) filtered.push(records[i]);
      }
      return filtered;
  }
}

