import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { stopInworldRuntime } from '@inworld/runtime';
import { createConversationGraph, ConversationGraphConfig } from './graphs/conversation_graph';
import { getDefaultMemoryStore } from './storage/memory_store';
import { MemorySnapshot } from './memories/types';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './utils/logger';
import { debugStore } from './utils/debug_store';
import chalk from 'chalk';

const USER_ID = process.env.USER_ID || 'cli_user';

// Load Templates
const FLASH_TEMPLATE_PATH = path.resolve(__dirname, 'memories/flash/templates/flash_memory_prompt.jinja');
const LONG_TERM_TEMPLATE_PATH = path.resolve(__dirname, 'memories/long_term/templates/long_term_prompt.jinja');

async function main() {
    
    const apiKey = process.env.INWORLD_API_KEY;
    if (!apiKey) throw new Error('INWORLD_API_KEY required');

    const flashTemplate = fs.readFileSync(FLASH_TEMPLATE_PATH, 'utf-8');
    const longTermTemplate = fs.readFileSync(LONG_TERM_TEMPLATE_PATH, 'utf-8');

    // Config
    const config: ConversationGraphConfig = {
        apiKey,
        llmProvider: process.env.MEMORY_LLM_PROVIDER || 'openai',
        llmModelName: process.env.MEMORY_LLM_MODEL || 'gpt-4o-mini',
        llmComponentId: 'memory_llm',
        embedderComponentId: 'shared_embedder',
        embedderProvider: 'inworld',
        embedderModelName: 'BAAI/bge-large-en-v1.5',
        conversationLLMProvider: process.env.CONVERSATION_LLM_PROVIDER || 'openai',
        conversationLLMModel: process.env.CONVERSATION_LLM_MODEL || 'gpt-4o-mini',
        flashConfig: {
            promptTemplate: flashTemplate
        },
        longTermConfig: {
            promptTemplate: longTermTemplate
        },
        flashMemoryInterval: parseInt(process.env.FLASH_MEMORY_INTERVAL || '2', 10),
        longTermMemoryInterval: parseInt(process.env.LONG_TERM_MEMORY_INTERVAL || '10', 10),
        maxHistoryToProcess: parseInt(process.env.MAX_HISTORY_TURNS || '20', 10),
        ragConfig: {
            embedderComponentId: 'shared_embedder',
            similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.3'),
            maxContextItems: parseInt(process.env.MAX_RETURNED_MEMORIES || '3', 10)
        },
        resultMergeConfig: {
            similarityThreshold: parseFloat(process.env.RESULT_MERGE_SIMILARITY_THRESHOLD || '0.9'),
            maxFlashMemories: parseInt(process.env.RESULT_MERGE_MAX_FLASH_MEMORIES || '200', 10),
            maxLongTermMemories: parseInt(process.env.RESULT_MERGE_MAX_LONG_TERM_MEMORIES || '200', 10),
            maxHistoryEvents: parseInt(process.env.RESULT_MERGE_MAX_HISTORY_EVENTS || '500', 10)
        }
    };

    const graph = createConversationGraph(config);
    const memoryStore = getDefaultMemoryStore({ storageDir: './memory_data' });

    // Load initial state
    let snapshot = memoryStore.loadOrCreateMemorySnapshot(USER_ID) as unknown as MemorySnapshot;
    
    // Ensure history exists
    if (!snapshot.conversationHistory) snapshot.conversationHistory = [];

    const terminal = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    logger.info("Inworld Memory CLI is ready.")

    while (true) {
        const query = await terminal.question(`${chalk.green.bold('You:')} `);

        // Input for graph
        const input = {
            query,
            snapshot,
            history: snapshot.conversationHistory
        };
        
        try {
            const { outputStream } = await graph.start({ value: input });
            let assistantResponse = '';
            let hasStartedResponse = false;

            for await (const output of outputStream) {
                // Check for LLM Content (Streaming)
                output.processResponse({
                    Content: (content) => {
                        if (!hasStartedResponse) {
                            process.stdout.write(chalk.cyan.bold('Assistant: '));
                            hasStartedResponse = true;
                        }
                        process.stdout.write(`${content.content}\n`);
                        assistantResponse += content.content;
                    },
                    default: (data) => {
                        // Check if this is the final snapshot
                        if (data && (data.flashMemory || data.longTermMemory)) {
                            snapshot = data as MemorySnapshot;
                        }
                    }
                });
                
                // Also check direct data if processResponse doesn't catch custom objects
                if (output.data && (output.data.flashMemory || output.data.longTermMemory)) {
                     snapshot = output.data as MemorySnapshot;
                }
            }
            
            if (hasStartedResponse) {
                process.stdout.write('\n');
            }
            
            memoryStore.saveMemorySnapshot(USER_ID, snapshot);

        } catch (e) {
            logger.error('Error:', e);
        }
    }

    terminal.close();
    await graph.stop();
    stopInworldRuntime();
}

main();
