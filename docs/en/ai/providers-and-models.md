# Providers & models

**🌐 English · [Español](../../es/ai/providers-and-models.md)**

> Choose who thinks for you: a local model with Ollama (private) or a cloud one. The model's *tier* decides what the AI can do.

<!-- 📷 CAPTURE: docs/images/ai/settings-ai-providers.png — The Settings → AI tab with the provider selector, API key, and default model. -->

## What it is

AmoxSQL isn't tied to a single AI engine. You can connect a **local** model (with Ollama, so nothing leaves your machine) or a **cloud** provider with your API key. Everything is set in **Settings → AI**: the provider, the keys, and the default model.

Each model is classified into a **tier** (low / medium / high / cloud) that determines its capabilities — tool-calling, charts, notebooks, memory, reasoning — and how much context it handles. You don't have to memorize it: the AI adapts to the model you pick.

## When to use each path

- **Ollama (local)** when privacy matters or you don't want to depend on the internet or a key.
- **Cloud** when you want the most capability and context window for large analyses.
- If you have neither, there's the [external Skills](introduction.md) path to paste your context into any AI chat.

## How to use it

### Set up a local model (Ollama)
1. Install Ollama and open it.
2. In **Settings → AI**, choose the **Ollama** provider.
3. Download a model from the IDE itself (the list shows installed models and lets you pull more).
4. Select it as the **default model**.

### Set up a cloud provider
1. In **Settings → AI**, choose the provider (Gemini, Anthropic, OpenAI, or MiniMax).
2. Paste your **API key**. For Google Vertex, set project/location (it uses ADC credentials).
3. Pick the default model from the live-discovered list.

### Switch models on the fly
The composer's model selector (in both the Assistant and Deep Dive) lets you switch models per conversation.

### Use a brand-new model ("Custom Model…")
If the provider shipped a model that isn't in the list yet, use **Custom Model…** and type its exact identifier. AmoxSQL assigns capabilities by its name.

## Reference

### Providers

| Provider | Type | Authentication |
|---|---|---|
| **Ollama** | Local | None — runs on your machine; model download from the IDE |
| **Google Gemini** | Cloud | API key **or** Vertex/ADC |
| **Anthropic** | Cloud | API key |
| **OpenAI** | Cloud | API key |
| **Google Vertex** | Cloud | Project + location (ADC credentials) |
| **MiniMax** | Cloud | API key (M-series with always-on advanced reasoning) |

### Model tiers and capabilities

| Tier | Examples | Tools | Charts | Notebooks | Steps |
|---|---|---|---|---|---|
| **low** (<3B) | phi3:mini, gemma3:1b | No | No | No | 1 (prompt-only) |
| **medium** | qwen3:8b, llama3.1:8b | Yes | Yes | Yes | 5 |
| **high** (20B+) | qwen3:32b, gpt-oss:20b | Yes | Yes | Yes | 10 |
| **cloud** | Gemini, Anthropic, OpenAI, MiniMax | Yes | Yes | Yes | 15 |

Capabilities (`supportsToolCalling`, `supportsCharts`, `supportsNotebooks`, `supportsMemory`, reasoning) and context size are derived from the tier. Low-tier models fall back to [prompt-only mode](prompt-only-mode.md).

### Reasoning (thinking)

Some models expose their reasoning. On **MiniMax M-series** models advanced reasoning is **always on** and is shown in the [Deep Dive](deep-dive.md) inspector. For local Ollama models you can turn thinking **On / Off / Auto per model** — see [Local AI performance](local-performance.md), since reasoning trades quality for latency.

## Tips & gems

- **Download models without leaving the IDE:** Ollama model management lives in Settings → AI.
- **Usage tracking** shows you the token consumption of cloud providers.
- **Custom Model… is an escape hatch:** use it as soon as a new model ships, no need to wait for an update.
- **You can force the tier:** if you think a model is misclassified, a tier override in the config fixes it.
- **Context = tier:** cloud models handle much larger windows, ideal for big databases.

## Related

- [AmoxSQL AI](introduction.md) · [Agent tools](agent-tools.md) · [Prompt-only mode](prompt-only-mode.md)
- [Local AI performance](local-performance.md) — keep local models fast
- [Deep Dive](deep-dive.md) · [Editor Assistant](editor-assistant.md)
- [Configuration](../reference/configuration.md)
