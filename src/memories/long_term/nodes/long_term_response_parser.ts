import { CustomNode, ProcessContext } from '@inworld/runtime/graph';
import { MemoryRecord } from '../../types';
import { logger } from '../../../utils/logger';

export interface LongTermResponseParserConfig {
  embedderComponentId: string;
}

export class LongTermResponseParserNode extends CustomNode {
  private embedderComponentId: string;

  constructor(config: LongTermResponseParserConfig) {
    super();
    this.embedderComponentId = config.embedderComponentId;
  }

  async process(context: ProcessContext, ...inputs: any[]): Promise<{ newLongTermMemory: MemoryRecord[] }> {
    const input = inputs[0];
    // Handle wrapped values or direct LLM response
    const response = input?.value || input;
    const content = this.extractContent(response);
    
    if (!content || content.trim().length === 0) {
        return { newLongTermMemory: [] };
    }

    const newRecords: MemoryRecord[] = [{
        text: content.trim(),
        embedding: [],
        topics: ['conversation_summary'],
        createdAt: Date.now()
    }];

    // Embed new records
    if (newRecords.length > 0) {
        const embedder = context.getEmbedderInterface(this.embedderComponentId);
        const texts = newRecords.map(r => r.text);
        const embeddings = await embedder.embedBatch(texts);
        
        newRecords.forEach((r, i) => {
            r.embedding = Array.from(embeddings[i]);
        });
    }

    if (newRecords.length > 0) {
        logger.logMemory('Long Term Created', newRecords);
    } else {
        logger.debug('No new Long Term memories created after parsing');
    }

    return {
        newLongTermMemory: newRecords
    };
  }

  private extractContent(response: any): string {
    if (typeof response === 'string') return response;
    if (response?.content) return response.content;
    if (response?.choices?.[0]?.message?.content) return response.choices[0].message.content;
    return '';
  }
}

