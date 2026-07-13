# Memory

**🌐 English · [Español](../../es/ai/memory.md)**

> The AI remembers your preferences and your business facts from one conversation to the next — so you don't have to repeat "amounts are in cents" or "I prefer bar charts" every time.

<!-- 📷 CAPTURE: docs/images/ai/memories-panel.png — AI Memories panel showing a list of memories with "Rule" and "Fact" badges, plus edit and delete buttons -->

## What it is

**Memory** is the AI's cross-conversation recall. At the end of each turn, a lightweight background process reads the conversation and extracts two kinds of item that might help later:

- **Rules** (`global_rule`) — how you want the AI to behave or format its output ("answer in Spanish", "always show the SQL", "I prefer compact figures").
- **Facts** (`personal_fact`) — facts about you, your company, or the nuances of your schema ("amounts are in cents", "the `orders` table excludes test orders with `customer_id < 4`").

Those memories are saved and injected into the AI's instructions in **later** conversations (even on unrelated topics), so you don't re-explain the same thing. They're managed in the **AI Memories** panel, where you can view, edit and delete each one.

Extraction runs in the background and doesn't block the response. It only runs when you sent recent messages, to avoid wasting extra calls.

## When to use it

- When you notice you **repeat** the same instructions to the AI every session.
- When your schema has **nuances** the AI should always remember but that you don't want to hard-code in `RULES.md`.
- If you'd rather have a formal, team-shared definition, use [Context as code](context-as-code.md) instead: memory is personal and self-learned; context is explicit and version-controlled.

## How to use it

### Let it learn
1. Chat with the AI as usual. When you say something like "from now on always show me the SQL" or "amounts are in cents", it becomes a memory candidate.
2. When the turn ends, the AI extracts rules and facts in the background and saves them.
3. In your next conversation those memories are already part of its context, with no effort from you.

### Manage memories
1. Open the **AI Memories** panel.
2. Each entry shows a badge (**Rule** or **Fact**) and its content.
3. Use the pencil to **edit** the text or change its category; use the trash icon to **delete** a memory that no longer applies.
4. The refresh button reloads the list.

## Reference

| Category | Badge | What it captures | Example |
|---|---|---|---|
| `global_rule` | Rule | Behavior/formatting preferences | "Always answer in Spanish" |
| `personal_fact` | Fact | Facts about you or your data | "`amount` is in cents (MXN)" |

| Action | Where | Effect |
|---|---|---|
| View | AI Memories panel | Lists all active memories |
| Edit | Pencil icon | Change the text or category |
| Delete | Trash icon | Removes the memory (stops injecting it) |
| Refresh | Refresh icon | Reloads the list from the database |

## Tips & gems

- **Requires a capable model.** Memory is available from the medium tier upward (models that support tool calling). Very small local models don't extract it. See [Providers & models](providers-and-models.md).
- **Everything is stored locally.** Memories live in your project's DuckDB database (`amoxsql_ai` schema) and never leave your machine. See [Local-first](../concepts/local-first.md).
- **Edit it when reality changes.** If a rule no longer applies, delete or rewrite it from the panel — faster than "un-teaching" it in a chat.
- **Memory vs. context:** memory is self-learned and personal; [context as code](context-as-code.md) is explicit, reviewable and team-shared. Use them together.

## Related

- [Context as code](context-as-code.md) · [Deep Dive](deep-dive.md) · [Skills](skills.md)
- [Providers & models](providers-and-models.md) · [Local-first](../concepts/local-first.md)
