import * as fs from 'fs';
import * as path from 'path';
import { MemorySnapshot } from '../memories/types';

/**
 * Simple file-based memory storage.
 */
export interface MemoryStoreConfig {
  storageDir: string;
}

export class MemoryStore {
  private storageDir: string;

  constructor(config: MemoryStoreConfig) {
    this.storageDir = config.storageDir;
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private getFilePath(userId: string): string {
    return path.join(this.storageDir, `${userId}.json`);
  }

  loadOrCreateMemorySnapshot(userId: string): MemorySnapshot {
    const filePath = this.getFilePath(userId);
    
    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const snapshot = JSON.parse(data);
        // Ensure fields exist
        return {
          flashMemory: snapshot.flashMemory || [],
          longTermMemory: snapshot.longTermMemory || [],
          conversationHistory: snapshot.conversationHistory || []
        };
      } catch (error) {
        console.error(`Failed to load memory for user ${userId}:`, error);
      }
    }

    return {
      flashMemory: [],
      longTermMemory: [],
      conversationHistory: []
    };
  }

  saveMemorySnapshot(userId: string, snapshot: MemorySnapshot): void {
    const filePath = this.getFilePath(userId);
    try {
      fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to save memory for user ${userId}:`, error);
    }
  }

  deleteMemorySnapshot(userId: string): void {
    const filePath = this.getFilePath(userId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

export function getDefaultMemoryStore(config: MemoryStoreConfig = { storageDir: './memory_data' }): MemoryStore {
  return new MemoryStore(config);
}

