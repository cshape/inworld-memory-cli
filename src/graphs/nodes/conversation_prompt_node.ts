import { CustomNode, GraphTypes, ProcessContext } from '@inworld/runtime/graph';
import { renderJinja } from '@inworld/runtime/primitives/llm';
import { InteractionEvent } from '../../memories/types';
import { logger } from '../../utils/logger';
import { debugStore } from '../../utils/debug_store';

export interface ConversationPromptConfig {
    promptTemplate: string;
    maxHistoryToProcess?: number;
}

export class ConversationPromptNode extends CustomNode {
    private config: ConversationPromptConfig;

    constructor(config: ConversationPromptConfig) {
        super();
        this.config = config;
    }

    async process(_context: ProcessContext, ...inputs: any[]): Promise<GraphTypes.LLMChatRequest> {
        // Inputs: 
        // 1. { query, snapshot, history } (Original Input)
        // 2. { relevantMemories } (Output from RAG)
        
        // We need to merge these.
        // In a graph, inputs come as an array.
        
        let query = '';
        let history: InteractionEvent[] = [];
        let relevantMemories: string[] = [];

        for (const input of inputs) {
            const val = input?.value || input;
            if (val?.query) query = val.query;
            if (val?.history) history = val.history;
            if (val?.relevantMemories) relevantMemories = val.relevantMemories;
        }

        // Slice history to maxHistoryToProcess
        // We want the LAST N items
        const maxTurns = this.config.maxHistoryToProcess || 10;
        const recentHistory = history.slice(-maxTurns);

        // Format history
        const historyText = recentHistory.map(e => `${e.role}: ${e.content || e.utterance}`).join('\n');
        
        // Format memories (omit block entirely when none are available)
        const memoryContext = relevantMemories.length > 0 
            ? `Relevant memories:\n${relevantMemories.map(m => `- ${m}`).join('\n')}`
            : '';

        const systemPrompt = await renderJinja(this.config.promptTemplate, {
            conversation_history: historyText,
            memory_context: memoryContext || undefined
        });

        logger.logPrompt('Conversation Prompt', systemPrompt);

        // Save prompt for debugging
        debugStore.setLastPrompt(systemPrompt);

        return new GraphTypes.LLMChatRequest({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query }
            ]
        });
    }
}

