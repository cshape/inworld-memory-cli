import { CustomNode, ProcessContext, GraphTypes } from '@inworld/runtime/graph';
import { MemoryUpdaterRequest, InteractionEvent, MemorySnapshot } from '../../memories/types';
import { logger } from '../../utils/logger';

export interface HistoryUpdateConfig {
    flashInterval?: number;
    longTermInterval?: number;
}

export class HistoryUpdateNode extends CustomNode {
    private config: HistoryUpdateConfig;

    constructor(config: HistoryUpdateConfig = {}) {
        super();
        this.config = {
            flashInterval: 1,
            longTermInterval: 10,
            ...config
        };
    }

    async process(_context: ProcessContext, ...inputs: any[]): Promise<MemoryUpdaterRequest & { response: string, runFlash: boolean, runLongTerm: boolean }> {
        // Inputs:
        // 1. Original Input { query, snapshot, history }
        // 2. LLM Response (GraphTypes.LLMChatResponse)

        let query = '';
        let snapshot: MemorySnapshot | null = null;
        let history: InteractionEvent[] = [];
        const candidateResponses: string[] = [];

        for (const input of inputs) {
            const val = input?.value || input;
            if (!val) continue;

            if (val.query) query = val.query;
            if (val.snapshot) snapshot = val.snapshot;
            if (val.history) history = val.history; // Original history

            // Check for LLM Response
            // It might be GraphTypes.LLMChatResponse (if exists) or just { content: ... }
            // We check properties to be safe and avoid type errors if the class isn't exported
            if ((val.choices && Array.isArray(val.choices)) || (val.created && val.model)) {
                // Extract content
                 const msg = val.choices?.[0]?.message;
                 if (msg?.content) candidateResponses.push(msg.content);
            }
            
            // Common response shapes
            if (typeof val === 'string') {
                candidateResponses.push(val);
            } else {
                if (typeof val.content === 'string') candidateResponses.push(val.content);
                if (typeof (val as any).response === 'string') candidateResponses.push((val as any).response);
            }
        }

        if (!snapshot) {
            throw new Error('HistoryUpdateNode: Missing snapshot');
        }

        // Create new history
        const newHistory = [...history];
        
        // Add User Query
        newHistory.push({
            role: 'user',
            content: query,
            agentName: 'User'
        });

        const responseContent = candidateResponses.filter(r => typeof r === 'string' && r.trim().length > 0).pop() || '';

        // Add Assistant Response only if we captured something
        if (responseContent) {
            newHistory.push({
                role: 'assistant',
                content: responseContent,
                agentName: 'Assistant'
            });
        }

        // Decide if forceLongTerm (every 10 turns?)
        // We can check history length
        const turnCount = newHistory.filter(e => e.role === 'user').length;
        
        const flashInterval = this.config.flashInterval || 1;
        const longTermInterval = this.config.longTermInterval || 10;

        const runFlash = turnCount > 0 && turnCount % flashInterval === 0;
        const runLongTerm = turnCount > 0 && turnCount % longTermInterval === 0;

        return {
            eventHistory: newHistory,
            memorySnapshot: snapshot,
            forceLongTerm: runLongTerm,
            response: responseContent, // Extra field for client/debug
            runFlash,
            runLongTerm
        };
    }
}

