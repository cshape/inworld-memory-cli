import { GraphBuilder, Graph, ProxyNode, RemoteLLMChatNode, SubgraphNode, RemoteEmbedderComponent, RemoteLLMComponent, ProcessContext } from '@inworld/runtime/graph';
import { createFlashSubgraph } from '../memories/flash/flash_subgraph';
import { createLongTermSubgraph } from '../memories/long_term/long_term_subgraph';
import { ResultMergeNode, ResultMergeConfig } from '../memories/common/nodes/result_merge_node';
import { RAGNode, RAGConfig } from './nodes/rag_node';
import { ConversationPromptNode } from './nodes/conversation_prompt_node';
import { HistoryUpdateNode } from './nodes/history_update_node';
import { MemorySnapshot, FlashMemoryConfig, LongTermMemoryConfig } from '../memories/types';
import * as fs from 'fs';
import * as path from 'path';

// Helper to read template
const PROMPT_TEMPLATE_PATH = path.resolve(__dirname, 'templates/conversation_prompt.jinja');

export interface ConversationGraphConfig {
    apiKey: string;
    ragConfig: RAGConfig;
    conversationLLMProvider: string;
    conversationLLMModel: string;
    embedderProvider: string;
    embedderModelName: string;
    embedderComponentId: string;
    
    // Memory Configs
    flashConfig: FlashMemoryConfig;
    longTermConfig: LongTermMemoryConfig;
    flashMemoryInterval?: number;
    longTermMemoryInterval?: number;
    maxHistoryToProcess?: number;
    resultMergeConfig?: ResultMergeConfig;

    llmProvider: string;
    llmModelName: string;
    llmComponentId: string;
}

export function createConversationGraph(config: ConversationGraphConfig): Graph {
    const promptTemplate = fs.readFileSync(PROMPT_TEMPLATE_PATH, 'utf-8');

    // Components
    const embedderComponent = new RemoteEmbedderComponent({
        id: config.embedderComponentId,
        provider: config.embedderProvider,
        modelName: config.embedderModelName
    });

    const memoryLLMComponent = new RemoteLLMComponent({
        id: config.llmComponentId,
        provider: config.llmProvider,
        modelName: config.llmModelName,
        defaultConfig: { maxNewTokens: 800, temperature: 0.7 }
    });

    // Create Nodes
    const inputNode = new ProxyNode({ id: 'conversation_input' });
    const ragNode = new RAGNode(config.ragConfig);
    const promptNode = new ConversationPromptNode({
        promptTemplate: promptTemplate,
        maxHistoryToProcess: config.maxHistoryToProcess
    });
    const llmNode = new RemoteLLMChatNode({
        id: 'conversation_llm',
        provider: config.conversationLLMProvider,
        modelName: config.conversationLLMModel,
        textGenerationConfig: { temperature: 0.7 },
        reportToClient: true
    });
    const historyUpdateNode = new HistoryUpdateNode({
        flashInterval: config.flashMemoryInterval,
        longTermInterval: config.longTermMemoryInterval
    });
    const flashSubgraph = createFlashSubgraph('flash_memory_subgraph', {
        ...config.flashConfig,
        maxHistoryToProcess: config.flashMemoryInterval,
        llmProvider: config.llmProvider,
        llmModelName: config.llmModelName,
        embedderComponentId: config.embedderComponentId
    });
    const longTermSubgraph = createLongTermSubgraph('long_term_memory_subgraph', {
        ...config.longTermConfig,
        maxHistoryToProcess: config.longTermMemoryInterval,
        embedderComponentId: config.embedderComponentId,
        llmComponentId: config.llmComponentId,
        llmProvider: config.llmProvider,
        llmModelName: config.llmModelName
    });
    const flashNode = new SubgraphNode({ subgraphId: 'flash_memory_subgraph' });
    const longTermNode = new SubgraphNode({ subgraphId: 'long_term_memory_subgraph' });
    const mergeNode = new ResultMergeNode(config.resultMergeConfig);

    return new GraphBuilder({
        id: 'conversation_graph',
        apiKey: config.apiKey,
        enableRemoteConfig: false
    })
    // Components
    .addComponent(embedderComponent)
    .addComponent(memoryLLMComponent)

    .addNode(inputNode)
    .addNode(ragNode)
    .addEdge(inputNode, ragNode)
    
    // Prompt (needs Input + RAG)
    .addNode(promptNode)
    .addEdge(inputNode, promptNode)
    .addEdge(ragNode, promptNode)
    
    // LLM
    .addNode(llmNode)
    .addEdge(promptNode, llmNode)
    
    // History Update (needs Input + LLM)
    .addNode(historyUpdateNode)
    .addEdge(inputNode, historyUpdateNode)
    .addEdge(llmNode, historyUpdateNode)
    
    // Memory Section
    .addSubgraph(flashSubgraph)
    .addSubgraph(longTermSubgraph)
    .addNode(flashNode)
    .addNode(longTermNode)
    .addNode(mergeNode)
    
    // Connect HistoryUpdate (which produces MemoryUpdaterRequest) to Memory Subgraphs
    .addEdge(historyUpdateNode, flashNode, { condition: (data: any) => !!data?.runFlash })
    .addEdge(historyUpdateNode, longTermNode, { condition: (data: any) => !!data?.runLongTerm })
    
    // Connect Subgraphs to Merge
    .addEdge(flashNode, mergeNode, { optional: true })
    .addEdge(longTermNode, mergeNode, { optional: true })
    .addEdge(historyUpdateNode, mergeNode)
    
    .setStartNode(inputNode)
    .setEndNode(mergeNode)
    .build();
}
