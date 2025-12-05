# Inworld Memory CLI

Long-term AI agent memory using [Inworld Runtime](https://inworld.ai).

## Usage

```bash
cp .env.example .env
```

Add your INWORLD_API_KEY to the .env file

```bash
npm install
npm start
```

## Graph Architecture

```mermaid
flowchart TB
    Input[User Input] --> RAG[RAG Node]
    Input --> Prompt[Prompt Builder]
    RAG --> Prompt
    Prompt --> LLM[Conversation LLM]
    LLM --> History[History Update]
    Input --> History

    History -->|interval| Flash
    History -->|interval| LongTerm
    History --> Merge[Result Merge]

    subgraph Flash[Flash Memory Subgraph]
        F1[Prompt Builder] --> F2[LLM] --> F3[Response Parser]
    end

    subgraph LongTerm[Long-Term Memory Subgraph]
        L1[Prompt Builder] --> L2[LLM] --> L3[Response Parser]
    end

    Flash --> Merge
    LongTerm --> Merge
    Merge --> Output[Memory Snapshot]
```

## Project Structure

```
src/
├── index.ts                    # CLI entrypoint
├── graphs/
│   ├── conversation_graph.ts   # Main graph builder
│   ├── nodes/
│   │   ├── conversation_prompt_node.ts
│   │   ├── history_update_node.ts
│   │   └── rag_node.ts
│   └── templates/
│       └── conversation_prompt.jinja
├── memories/
│   ├── types.ts                # Memory types
│   ├── common/nodes/
│   │   └── result_merge_node.ts
│   ├── flash/
│   │   ├── flash_subgraph.ts
│   │   ├── nodes/
│   │   └── templates/
│   └── long_term/
│       ├── long_term_subgraph.ts
│       ├── nodes/
│       └── templates/
├── storage/
│   └── memory_store.ts         # Persistence layer
└── utils/
    ├── debug_store.ts
    └── logger.ts
```

