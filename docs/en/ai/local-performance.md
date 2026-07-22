# Local AI performance

**🌐 English · [Español](../../es/ai/rendimiento-local.md)**

> Make a local Ollama model respond almost instantly: the model kept hot in memory, only the context it needs, and reasoning under your control. Here's everything that moves the needle.

## What it is

A local model with [Ollama](providers-and-models.md) runs on your machine, so its speed depends on your hardware and on how you talk to it. AmoxSQL is tuned to squeeze that performance: it keeps the model loaded, sends only the context it needs, reuses what's already been processed, and lets you turn reasoning off when you don't need it.

Two things dominate local latency:

1. **Loading the model into memory** — the first time you use a model (or after a while idle) its weights must be loaded into memory. That's the "cold start" you feel when switching models.
2. **Processing the input prompt** — before writing the first token, the model "reads" everything you send. The longer the prompt, the longer it takes — and on CPU that's expensive.

AmoxSQL attacks both.

## When to pay attention

- The first message after **switching models** is slow → that's the load into memory (see *warm-up*).
- The AI feels slower in AmoxSQL than in the Ollama terminal → usually extra context or reasoning left on.
- You're about to use **Deep Dive** on a large database → a stronger model helps (see the suitability note).
- Your machine has little **VRAM** (GPU) → the model may spill onto the CPU and slow down (the indicator warns you).

## How to use it

### The model status indicator

Next to the model selector (in both the Assistant and Deep Dive) there's a colored dot:

| Dot | Meaning |
|---|---|
| ● green | **Hot** — the model is in memory (ideally in VRAM). Near-instant response. |
| ◐ amber | **Loaded but on CPU** — part of the model didn't fit in VRAM and runs on CPU. Works, but slower. |
| ○ gray | **Cold** — not loaded. The first message will pay the load. |

When you select a model, AmoxSQL **preloads it in the background** (warm-up) while you type your question, so it's hot by the time you hit send.

### Per-model reasoning (thinking)

A model's "thinking" improves complex answers, but adds latency: the model writes an internal monologue **before** answering you. In **Settings → AI → Local AI performance** you control this per model:

- **Auto** — uses the recommended default for that model (for the qwen family and ornith, Auto keeps it **off** in the tool loop, because invisible chain-of-thought is pure perceived latency).
- **On** — forces reasoning (useful for hard analysis).
- **Off** — direct answer, no preamble.

Some models (like lfm2.5) **always reason by design** and show as "Always on" (no control).

### Model per mode

The **editor Assistant** and **[Deep Dive](deep-dive.md)** each remember **their own model**. The idea: a small, fast model for the Assistant (which only sees your active query), and a stronger one for Deep Dive (which explores the whole database). Pick the model in each panel's selector and each one keeps its own.

If you enter Deep Dive with a small model (<15B), you'll see a gentle hint: it will work, but a local model ≥25B or a cloud one gives noticeably deeper analysis. It's a recommendation, never a block.

### Runtime settings

In **Settings → AI → Local AI performance**:

- **Model in memory (keep-alive)** — how long it stays loaded after use. Default `4h`, so there are no reloads between queries. `-1` = forever; `30m`, `2h`, etc.
- **Context window (num_ctx)** — context tokens per model. `0` = automatic (8k for small models, 16k for the rest). Raise it only if it fits in your VRAM.
- **Memory extraction** — analyzing each conversation to remember preferences uses an extra model call. Locally it competes for Ollama's single "slot", so the default (**Cloud only**) skips it for local models.

## Reference

### Choosing a model for your hardware

| Your machine | Recommended | Avoid for smooth use |
|---|---|---|
| GPU with **≥8 GB VRAM** | qwen3.5:9b, ornith:9b, gemma4:e4b fit in VRAM and fly | — |
| GPU with **2–4 GB VRAM** | lfm2.5, gemma4:e2b, qwen3.5:2b (few active params) | dense 9B+ models (they spill to CPU) |
| **CPU only** | lfm2.5 (~1B active), gemma4:e2b | dense 7B+ models |

lfm2.5 and gemma4:e2b are built to be fast even without a strong GPU. Dense 9B+ models shine when they fit entirely in VRAM.

### Getting the most out of Ollama (outside AmoxSQL)

These live in your Ollama install, not in AmoxSQL, but they matter a lot:

- **Update Ollama** to the latest version. Recent versions reuse already-processed tokens between messages better (prefix cache) and enable *flash attention* on more GPUs — one of the highest-impact, zero-cost improvements.
- **`OLLAMA_FLASH_ATTENTION=1`** — faster attention and less memory growth as context grows.
- **`OLLAMA_KV_CACHE_TYPE=q8_0`** — halves the cache memory with negligible quality loss (requires flash attention).

Set these as system environment variables before starting Ollama.

## Tips & gems

- **Let it warm up:** opening the AI panel or switching models already triggers preloading. If the dot is ○, wait for ● before sending the first message.
- **Turn thinking off for fast answers:** on straightforward SQL tasks, "Off" removes the preamble and you answer sooner.
- **One model per mode:** put lfm2.5 or gemma4:e2b in the Assistant and reserve the big model for Deep Dive.
- **Watch the amber dot:** if a model shows ◐ (on CPU), you're paying a slowdown — try a smaller one or add VRAM.
- **Long keep-alive = no cold starts:** the 4h default keeps the model ready across your whole session.

## Related

- [Providers and models](providers-and-models.md) · [AmoxSQL's AI](introduction.md)
- [Editor Assistant](editor-assistant.md) · [Deep Dive](deep-dive.md)
- [Prompt-only mode](prompt-only-mode.md) · [Memory](memory.md)
- [Configuration](../reference/configuration.md)
