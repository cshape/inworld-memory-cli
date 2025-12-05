import { CustomNode, ProcessContext } from '@inworld/runtime/graph';
import { MemoryRecord, MemorySnapshot } from '../../types';
import { logger } from '../../../utils/logger';

export interface ResultMergeConfig {
    similarityThreshold?: number;
    maxFlashMemories?: number;
    maxLongTermMemories?: number;
    maxHistoryEvents?: number;
}

export class ResultMergeNode extends CustomNode {
  private config: Required<ResultMergeConfig>;

  constructor(config: ResultMergeConfig = {}) {
    super();
    this.config = {
        similarityThreshold: config.similarityThreshold ?? 0.9,
        maxFlashMemories: config.maxFlashMemories ?? 200,
        maxLongTermMemories: config.maxLongTermMemories ?? 200,
        maxHistoryEvents: config.maxHistoryEvents ?? 500,
    };
  }

  async process(_context: ProcessContext, ...inputs: any[]): Promise<MemorySnapshot> {
    let newFlashMemories: MemoryRecord[] = [];
    let newLongTermMemories: MemoryRecord[] = [];
    let originalSnapshot: MemorySnapshot | null = null;
    let updatedHistory: any[] | null = null;

    // Iterate inputs to find our data
    for (const input of inputs) {
      const val = input?.value || input;
      if (!val) continue;

      // Check for updated history (from HistoryUpdateNode)
      if (val.eventHistory && Array.isArray(val.eventHistory)) {
          updatedHistory = val.eventHistory;
      }

      // Check for Flash Results
      if ('memoryRecords' in val) {
        newFlashMemories = val.memoryRecords;
      } 
      // Check for LongTerm Results
      else if ('newLongTermMemory' in val) {
        newLongTermMemories = val.newLongTermMemory;
      }
      // Check for Original Snapshot (from HistoryUpdateNode or similar)
      else if ('memorySnapshot' in val) {
        originalSnapshot = val.memorySnapshot;
      }
      // Fallback: Check if the input IS the snapshot
      else if ('flashMemory' in val && 'longTermMemory' in val) {
        originalSnapshot = val as MemorySnapshot;
      }
    }

    if (!originalSnapshot) {
        logger.warn('[ResultMergeNode] Missing original snapshot. Creating empty.');
        originalSnapshot = { flashMemory: [], longTermMemory: [], conversationHistory: [] };
    }

    // Merge with deduplication against existing records
    const mergedFlash = this.mergeAndDedup(
        originalSnapshot.flashMemory || [],
        newFlashMemories,
        this.config.similarityThreshold
    ).slice(-this.config.maxFlashMemories);

    const mergedLongTerm = this.mergeAndDedup(
        originalSnapshot.longTermMemory || [],
        newLongTermMemories,
        this.config.similarityThreshold
    ).slice(-this.config.maxLongTermMemories);

    const mergedHistory = (updatedHistory || originalSnapshot.conversationHistory || []).slice(-this.config.maxHistoryEvents);

    const result: MemorySnapshot = {
        flashMemory: mergedFlash,
        longTermMemory: mergedLongTerm,
        conversationHistory: mergedHistory
    };

    if (newFlashMemories.length > 0) {
        logger.debug(`New flash memories created: ${newFlashMemories.length}`);
    } else {
        logger.debug('No new Flash memories created');
    }

    if (newLongTermMemories.length > 0) {
        logger.debug(`New long term memories created: ${newLongTermMemories.length}`);
    } else {
        logger.debug('No new Long term memories created');
    }
    
    logger.debug(`Turn complete. Total Flash: ${mergedFlash.length}, Total LongTerm: ${mergedLongTerm.length}, History Events: ${mergedHistory.length}`);

    return result;
  }

  private mergeAndDedup(existing: MemoryRecord[], incoming: MemoryRecord[], threshold: number): MemoryRecord[] {
      const safeExisting = existing || [];
      const merged: MemoryRecord[] = [...safeExisting];

      for (const record of incoming || []) {
          const embedding = Array.isArray(record.embedding) ? record.embedding : [];
          const isDuplicate = merged.some(existingRecord => {
              const existingEmbedding = Array.isArray(existingRecord.embedding) ? existingRecord.embedding : [];
              if (existingEmbedding.length === 0 || embedding.length === 0) {
                  return false;
              }
              return this.cosineSimilarity(existingEmbedding, embedding) >= threshold;
          });

          if (!isDuplicate) {
              merged.push(record);
          }
      }

      return merged;
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

