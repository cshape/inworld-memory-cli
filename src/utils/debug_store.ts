export class DebugStore {
    private static instance: DebugStore;
    private lastPrompt: string | null = null;

    private constructor() {}

    public static getInstance(): DebugStore {
        if (!DebugStore.instance) {
            DebugStore.instance = new DebugStore();
        }
        return DebugStore.instance;
    }

    public setLastPrompt(prompt: string): void {
        this.lastPrompt = prompt;
    }

    public getLastPrompt(): string | null {
        return this.lastPrompt;
    }
}

export const debugStore = DebugStore.getInstance();

