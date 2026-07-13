# AmoxSQL AI

**🌐 English · [Español](../../es/ai/introduction.md)**

> A data analyst inside the IDE: talk to it in plain language and it writes and runs DuckDB SQL over your data. It's local-first (with Ollama) or cloud.

<img src="../../../images/07_ai_sidebar.png" alt="AmoxSQL AI" width="100%" />

## What it is

AmoxSQL AI turns natural-language questions into DuckDB SQL, runs it against your tables and files, and answers with numbers, tables, and charts. It's not a generic chatbot: it knows your schema, follows your project's rules, and works on the local engine.

It lives on **two surfaces** with different levels of autonomy:

- **Editor Assistant** — a compact sidebar (Ctrl+L) tied to the open `.sql` or `.sqlnb` file. It generates, explains, and optimizes the current query, and proposes edits and charts. You drive; it helps. See [Editor Assistant](editor-assistant.md).
- **Deep Dive** — a full-screen autonomous analyst over your **whole** local database. It plans the steps, explores on its own, narrates the findings, and can build a notebook. See [Deep Dive](deep-dive.md).

There's also a **third path with no local model or key**: download an AmoxSQL *Skill* and the *Metadata for AI* context of your data, and paste them into any external AI chat you use. That way you get AI help even without Ollama or an API key configured.

## When to use it

- **Assistant** when you're writing SQL or tweaking a chart and want a concrete hand ("why does this query return 0 rows?", "chart this by region").
- **Deep Dive** when you have a business question and want the full analysis done for you ("why did sales drop in Q3?", "give me an overview of this dataset").
- **External path** when you can't install a local model or pay for an API, but you do have access to an AI chat at work.

## How to get started

1. Open **Settings → AI** (see [Configuration](../reference/configuration.md)) and pick a path:
   - **Local (private):** install Ollama and download a model from the IDE itself. See [Providers & models](providers-and-models.md).
   - **Cloud:** paste an API key (Google Gemini, Anthropic, OpenAI, or MiniMax) or set up Google Vertex.
2. Choose the **provider** and the **default model** on that same screen.
3. Open a surface:
   - **Assistant:** the **Assist** button in the editor bar, or **Ctrl+L**.
   - **Deep Dive:** its dedicated tab.
4. Type your question in plain language and send. The AI looks at your schema, writes DuckDB SQL, runs it, and answers.

> **No local model or key?** Go to **Settings → AI → External AI Skills**, download a Skill (`.md`), upload it to your AI chat as an instruction, and use **Metadata for AI** (the editor's Export menu or the results toolbar) to copy your data context and paste it into the chat.

## Reference

### The two surfaces

| Surface | Where | Scope | Autonomy |
|---|---|---|---|
| **Editor Assistant** | Sidebar (Ctrl+L) | The open file | Reactive — you drive |
| **Deep Dive** | Full-screen tab | The whole database | Autonomous — plans and explores |

### What you need to start

| Path | Requirement | Privacy |
|---|---|---|
| Local | Ollama + a downloaded model | Nothing leaves your machine |
| Cloud | API key (Gemini/Anthropic/OpenAI/MiniMax) or Vertex/ADC | Queries go to the provider |
| External | Any AI chat + a downloadable Skill + Metadata for AI | You control what you paste |

## Tips & gems

- **Local is truly private:** with an Ollama model, neither your data nor your questions leave your machine — the engine and the model both run locally.
- **Promote a conversation:** you can escalate an Assistant chat to Deep Dive without losing context.
- **Drag in context:** drop a table or a file onto the chat so the AI has it on hand.
- **Numbers cite their source:** in the prose, values link back to the query that produced them (click → "Source Query").
- **Model tier rules everything:** small models (<3B) use a simpler [prompt-only mode](prompt-only-mode.md); medium and cloud models unlock tools, charts, and notebooks.

## Related

- [Editor Assistant](editor-assistant.md) · [Deep Dive](deep-dive.md)
- [Providers & models](providers-and-models.md) · [Agent tools](agent-tools.md)
- [Prompt-only mode](prompt-only-mode.md) · [Metadata for AI](metadata-for-ai.md)
- [Skills](skills.md) · [Context as code](context-as-code.md) · [Memory](memory.md)
