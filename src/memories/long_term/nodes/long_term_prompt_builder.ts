import { CustomNode, GraphTypes, ProcessContext } from '@inworld/runtime/graph';
import { renderJinja } from '@inworld/runtime/primitives/llm';
import { logger } from '../../../utils/logger';
import { 
  MemoryUpdaterRequest, 
  LongTermMemoryConfig
} from '../../types';

/**
 * LongTermPromptBuilderNode
 * 
 * Consolidated node that:
 * 1. Takes in the event history and long term memory records
 * 2. Generates a prompt for the LLM to generate a new long term memory record
 */

export class LongTermPromptBuilderNode extends CustomNode {
  private config: LongTermMemoryConfig;

  constructor(config: LongTermMemoryConfig) {
    super();
    this.config = config;
  }

  async process(_context: ProcessContext, ...inputs: any[]): Promise<GraphTypes.LLMChatRequest> {
    const input = inputs[0];
    const request = (input?.value || input) as MemoryUpdaterRequest;
    
    const longTermMemoryRecords = request?.memorySnapshot?.longTermMemory || [];
    const eventHistory = request?.eventHistory || [];

    // Find existing LongTerm for this topic (or all LongTerms to provide context)
    // We'll pass all previous LongTerm text as context.
    const previousLongTermText = longTermMemoryRecords
      .map(r => r.text)
      .join('\n\n');
    
    // Extract dialogue from history
    // Get last N turns based on config
    const maxTurns = this.config.maxHistoryToProcess || 10;
    const historySlice = eventHistory.slice(-maxTurns);
    const dialogueContent = historySlice.map(e => `${e.role}: ${e.content || e.utterance}`).join('\n');

    const prompt = await renderJinja(this.config.promptTemplate, {
      topic: 'conversation_summary',
      dialogueLines: dialogueContent, 
      previousLongTerm: previousLongTermText
    });

    logger.logPrompt('Long Term Memory Prompt', prompt);

    return new GraphTypes.LLMChatRequest({
      messages: [{ role: 'user', content: prompt }]
    });
  }
}


