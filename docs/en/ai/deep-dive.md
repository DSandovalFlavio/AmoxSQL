# Deep Dive

**🌐 English · [Español](../../es/ai/deep-dive.md)**

> Your autonomous analyst: hand it a business question and it plans, explores your database on its own, narrates the findings, and closes with a conclusions card.

<!-- 📷 CAPTURE: docs/images/ai/deep-dive-overview.png — The Deep Dive window with its three regions: conversation on the left, per-step inspector in the center, and the Session Inventory / Plan panel on the right. -->

## What it is

Deep Dive is the AI mode with the most autonomy. It lives in a **full-screen tab** and works over your **whole local database**, not a single file. Instead of answering one query, it runs an analysis: it forms a plan, explores the data step by step, verifies what it finds, and tells it back to you as a story.

The window has **three regions**:

1. **Conversation** — the narrated thread: opening, per-step findings, and closing.
2. **Per-step inspector** — for each step, the readable SQL, the result table, inline charts, and the agent's reasoning.
3. **Session Inventory** — on the right, with the **Plan panel**, the conversation context, and the generated artifacts (charts, notebooks, saved analyses).

## When to use it

- You have an open business question: *"why did churn drop?"*, *"find the revenue drivers"*.
- You want a full overview of a dataset you don't know.
- You need a notebook with the narrated analysis and its charts.
- For quick help on the query you're writing, use the [Editor Assistant](editor-assistant.md).

## How to use it

### Launch an analysis
1. Open the **Deep Dive** tab.
2. Type your question (or use an empty-state quick action: *Show all tables*, *Describe schema*, *Sample data*).
3. Send. The agent creates a plan and starts executing.

### Follow the plan and the steps
1. The **Plan panel** (right) shows the numbered steps with their status (pending, in progress, done, skipped, not done). A step the analyst never got to before concluding says **Not done**, never done.
2. Click any step or turn to **pin** the inspector to it; if you pin nothing, the inspector follows the live step.
3. In the inspector you see that step's SQL, result, and charts.

### Skip plan steps
Hover over a step to reveal a **skip** button; skipped steps are marked "skipped by user" and the agent proceeds without them.

### Ask about something specific ("Ask about this")
You can pin any chart, query, step, or finding as context for your next question:
1. Type **@** or **#** in the composer to pick a session artifact, **or**
2. Select text or a number in a response and click the floating **Ask about this** button.
3. With the reference attached, quick actions appear: **Explain**, **Redo differently**, **Go deeper**, **Validate**.

### When the analyst needs you
When the analyst asks you something, or runs out of iterations, a card appears **right above the box where you type**. Pick an option, or type your answer in the box. The session's tab shows an amber dot and the list of conversations says **Waiting for you**, so you notice it from anywhere. If you reopen the conversation later, the card is still there.

If it ran out of iterations, the card offers four ways to go on:

| Button | What it does |
|---|---|
| **Continue** | Resumes with a fresh budget |
| **Continue with instructions…** | Resumes focused on the text you type |
| **Finish with what it has** | Writes the conclusions from what it already has, without new queries |
| **Leave it here** | Stops the analysis as it is |

### Build a notebook
When you ask (or when it fits the analysis), the agent creates a `.sqlnb` notebook with the analysis and its charts, and opens it. See [Notebooks](../notebooks/notebooks.md).

## Reference

### The three regions

| Region | Contents |
|---|---|
| Conversation | Narrative with an arc: opening → per-step finding → closing |
| Per-step inspector | Readable SQL + result table + charts + reasoning |
| Session Inventory | Plan panel, dragged-in context, artifacts, session name |

### How it narrates (the arc)

| Phase | What the agent does |
|---|---|
| Opening | With the plan, it states the hypothesis and approach |
| Per step | Narrates the finding and why it matters before marking it done |
| Verification | Checks whether a finding is real or noise |
| Closing | The **NarrativeCard**: `tldr`, findings with their *so_what*, likely cause, actions, caveats |

### Process health

| Mechanism | What it guarantees |
|---|---|
| Iteration budget | The plan sizes how many iterations the analysis gets |
| Guaranteed wrap-up turn | If it runs out, it forces a synthesis instead of hanging |
| Anti-stall watchdog | If a step freezes, it aborts that iteration and resumes |
| Prose first | It never leaves the chat with a bare card and no narrative |

## Tips & gems

- **The NarrativeCard opens expanded:** findings, the "why?", and caveats are visible without clicks.
- **@ and # are your remote control:** reference any chart/query/step by name without hunting for it.
- **"Finalize now" exists for a reason:** if you already have enough, there's no need to spend more iterations.
- **Artifacts save themselves:** every chart, notebook, or analysis shows up in the session inventory.
- **Pin a step to study it:** click it and the inspector stops jumping to the live step.

## Related

- [Editor Assistant](editor-assistant.md) · [Agent tools](agent-tools.md) · [Providers & models](providers-and-models.md)
- [Skills](skills.md) · [Context as code](context-as-code.md) · [Memory](memory.md)
- [Notebooks](../notebooks/notebooks.md) · [Story Flow](../visualization/story-flow.md)
