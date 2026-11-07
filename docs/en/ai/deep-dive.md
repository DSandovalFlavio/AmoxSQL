# Deep Dive

**🌐 English · [Español](../../es/ai/deep-dive.md)**

> Your autonomous analyst: hand it a business question and it plans, explores your database on its own, narrates the findings, and closes with a conclusions card.

<!-- 📷 CAPTURE: docs/images/ai/deep-dive-overview.png — Deep Dive as a report: the index on the left, the answer on top and each step with its chart, and "How I got this" open on the right. -->

## What it is

Deep Dive is the AI mode with the most autonomy. It lives in a **full-screen tab** and works over your **whole local database**, not a single file. Instead of answering one query, it runs an analysis: it forms a plan, explores the data step by step, verifies what it finds, and tells it back to you as a story.

It reads as **a report that writes itself**:

1. **The report**, in one reading column: your question, the **answer** on top as soon as there is one, and below it **How I got there**: each plan step with its narration, its charts and its conclusion.
2. **The index**, on the left: the plan. Each step takes you to its section and shows its status. Below it, the deliverables: the session's charts, its notebooks, save as notebook and export to Markdown.
3. **How I got this**, on demand on the right: the queries behind one part of the report with their rows, whatever else the analyst did, and its reasoning there.

## When to use it

- You have an open business question: *"why did churn drop?"*, *"find the revenue drivers"*.
- You want a full overview of a dataset you don't know.
- You need a notebook with the narrated analysis and its charts.
- For quick help on the query you're writing, use the [Editor Assistant](editor-assistant.md).

## How to use it

### Launch an analysis
1. Open the **Deep Dive** tab.
2. Type your question, or pick one it suggests: they come from your project's metrics (`context/metrics.yml`), its glossary and its columns, in the project's language, and each one says where it comes from. Below them are the tables it can look at and, for the analyst, *See the tables* and *Profile the data*.
3. Send. The agent creates a plan and starts executing.

### Read the analysis
1. While it works, each step appears in the report with what it is finding, and the header says which step it is on (*Analyzing · step 2 of 4*). **Stop** stops it.
2. When it finishes, the **answer** moves to the top: the conclusion, what it rests on (steps done, queries, charts, caveats), the findings with their values, and what to do next.
3. The **index** shows the numbered steps with their status (pending, in progress, done, skipped, not done). A step the analyst never got to before concluding says **Not done**, never done. Click a step to go to its section.

### See how it got there
- **How I got this**, on a section, opens its queries on the right (the SQL, the rows, *Open in editor*, CSV) and the analyst's reasoning in that part.
- The magnifier next to a value in the answer, or a citation in the text, opens the query that produced that number.
- **See the data**, on a line of queries, does the same. **Esc** closes the panel.

### Steer it while it works
- **An instruction:** type in the box while it analyzes (*Give the analyst an instruction…*) and press Enter. It takes it at the next step, and it stays in the report where it was taken. With the box empty, the button is **Stop**.
- **Skip a step:** hover over a pending step in the index to reveal **Skip**, also while it runs.
- **Pause** finishes the step it's on and stops; **Continue** resumes the same plan. **Stop** cuts it right away; what was done is kept anyway.
- While it works, the report says what it is doing and for how long (*Running a query… 4 s*).

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

### If the API fails halfway
- **A per-minute limit** (Gemini's free tier allows 5 requests a minute): the analysis waits as long as the provider asks and repeats the step. The header says *Waiting for the quota · resumes in 31 s*. You don't have to do anything; **Stop** stops it.
- **If it still stops** (a daily quota, a provider error, Stop, or the window closing), what was done is kept: the finished steps with their charts stay in the report, and a line says where and why it stopped. The card to go on appears above the box. With a per-minute quota, **Continue in 31 s** goes on by itself at zero if you press it. With a daily quota, pick another model in the box and continue. The provider's error is under **Details**.
- Continuing resumes the same plan where it stopped; it doesn't start over.

### Build a notebook
When you ask (or when it fits the analysis), the agent creates a `.sqlnb` notebook with the analysis and its charts, and opens it. See [Notebooks](../notebooks/notebooks.md).

## Reference

### The three zones

| Zone | Contents |
|---|---|
| Index | Your questions, the answer, the plan's steps with their status, the deliverables |
| Report | Question → answer → each step with its narration, charts and conclusion → the box where you type |
| How I got this | On demand: queries, rows and reasoning behind one part of the report |

In a narrow window the side bar folds away when Deep Dive opens (it comes back with its button or **Ctrl+B**), and **How I got this** opens over the report.

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
- **"Finish with what it has" exists for a reason:** if you already have enough, there's no need to spend more iterations.
- **The deliverables are in the index:** each of the session's charts takes you to where it is in the report, and from there it opens in Story Flow.
- **Reopening a finished analysis** takes you straight to its answer.

## Related

- [Editor Assistant](editor-assistant.md) · [Agent tools](agent-tools.md) · [Providers & models](providers-and-models.md)
- [Skills](skills.md) · [Context as code](context-as-code.md) · [Memory](memory.md)
- [Notebooks](../notebooks/notebooks.md) · [Story Flow](../visualization/story-flow.md)
