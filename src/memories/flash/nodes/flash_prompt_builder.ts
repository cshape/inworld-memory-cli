import { CustomNode, GraphTypes, ProcessContext } from '@inworld/runtime/graph';
import { renderJinja } from '@inworld/runtime/primitives/llm';
import { logger } from '../../../utils/logger';
import { 
  MemoryUpdaterRequest, 
  FlashMemoryConfig, 
  InteractionEvent
} from '../../types';

// Helper functions (moved from old types file or inline)
function getDialogueSize(history: InteractionEvent[]): number {
  // Count distinct user/agent pairs or just user turns? 
  // The original implementation used a simplified count.
  // Let's assume user turns trigger it.
  return history.filter(e => e.role === 'user').length;
}

function getDialogueHistorySlice(history: InteractionEvent[], fromTurn: number, toTurn: number): string {
    const start = Math.max(0, fromTurn);
    const end = Math.min(history.length, toTurn);
    const slice = history.slice(start, end);
    return slice.map(e => `${e.role}: ${e.content || e.utterance}`).join('\n');
}

export class FlashPromptBuilderNode extends CustomNode {
  private config: FlashMemoryConfig;

  constructor(config: FlashMemoryConfig) {
    super();
    this.config = {
      maxHistoryToProcess: 10,
      ...config
    };
  }

  async process(_context: ProcessContext, ...inputs: any[]): Promise<GraphTypes.LLMChatRequest> {
    const input = inputs[0];
    const request = (input?.value || input) as MemoryUpdaterRequest;
    
    const eventHistory = request?.eventHistory;

    if (!eventHistory || !Array.isArray(eventHistory)) {
      return new GraphTypes.LLMChatRequest({ messages: [] });
    }

    // Prepare prompt
    // Slice history to limit context
    const maxTurns = this.config.maxHistoryToProcess || 10; // Default to 10 if not set
    const recentHistory = eventHistory.slice(-maxTurns);
    if (recentHistory.length === 0) {
      return new GraphTypes.LLMChatRequest({
        messages: [{ role: 'user', content: 'NO_OP_SKIP_TURN' }]
      });
    }

    const dialogueHistory = getDialogueHistorySlice(recentHistory, 0, recentHistory.length);

    const prompt = await renderJinja(this.config.promptTemplate, {
        dialogue_history: dialogueHistory
    });

    logger.logPrompt('Flash Memory Prompt', prompt);

    return new GraphTypes.LLMChatRequest({
        messages: [{ role: 'user', content: prompt }]
    });
  }
}

