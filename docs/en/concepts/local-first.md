# Local-first

**🌐 English · [Español](../../es/concepts/local-first.md)**

> "Local-first" is AmoxSQL's core idea: your data, the engine, and even the AI live on your machine. Nothing is uploaded to the cloud unless you explicitly choose to.

## What it means

- **Local engine:** DuckDB runs *in-process* on your machine. There's no remote database server.
- **Local storage:** your projects, databases, charts, and notebooks are files on your disk.
- **Optional local AI:** you can run the AI 100% offline with local models (Ollama), with no data leaving your machine.

## Why it matters

### Privacy
By default, your data doesn't travel to any external service. If you choose a cloud AI provider or export to a bucket, that's your explicit decision — not the default behavior.

### Speed
No network round-trips. Queries run at DuckDB's speed reading from your disk/RAM. That's why you won't see web-style "loading" spinners in AmoxSQL: things happen instantly. Treat the engine as local and fast — don't reason about network latency or caching like in a web app.

### Control
Everything is a file you own: `.sql`, `.sqlnb`, `.amoxvis`, `.amoxdeck`, `.sqlchain`. You can version them with Git, back them up, share them, or open them with other tools.

## When something does leave your machine
Only when you ask for it:
- Using a **cloud AI provider** (Gemini, Anthropic, OpenAI, Vertex, MiniMax) — you send prompts/context to that provider. The local alternative (Ollama) sends nothing.
- **Exporting to the cloud** (S3/GCS) — you upload the data you export.
- **Google Sheets** — you read remote sheets you connect.
- **Downloading models** from Ollama or **installing extensions** from DuckDB.

## Related
- [Architecture](architecture.md) · [AI introduction](../ai/introduction.md)
- [Providers & models](../ai/providers-and-models.md)
