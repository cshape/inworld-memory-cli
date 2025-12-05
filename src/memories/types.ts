
export interface InteractionEvent {
  role: 'user' | 'assistant' | 'system';
  content?: string;
  utterance?: string; // Legacy support
  agentName?: string;
}

export interface MemoryRecord {
  text: string;
  embedding: number[];
  topics: string[];
  createdAt?: number;
  importance?: number;
}

export interface MemorySnapshot {
  flashMemory: MemoryRecord[];
  longTermMemory: MemoryRecord[];
  conversationHistory?: InteractionEvent[]; // Changed from string[] to InteractionEvent[]
}

export interface MemoryUpdaterRequest {
  eventHistory: InteractionEvent[];
  memorySnapshot: MemorySnapshot;
  forceLongTerm?: boolean;
}

// Configuration Interfaces
export interface FlashMemoryConfig {
  promptTemplate: string;
  maxHistoryToProcess?: number;
  maxFlashMemory?: number;
  maxTopicsPerMemory?: number;
  similarityThreshold?: number;
}

export interface LongTermMemoryConfig {
  promptTemplate: string;
  maxHistoryToProcess?: number;
}

// Intermediate Types
export interface LongTermSummarizationTask {
  topic: string;
  flashMemories: MemoryRecord[]; // Changed from flashMemory
  previousLongTerm?: MemoryRecord;
}

export interface LongTermTasks {
  newFlashMemory: MemoryRecord[];
  newLongTermMemory: MemoryRecord[];
  summarizationTasks: LongTermSummarizationTask[];
}

