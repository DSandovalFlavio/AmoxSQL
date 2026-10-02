# Run a process from the command line

**🌐 English · [Español](../../es/data-flow/command-line.md)**

> A [Data Flow](data-flow.md) process can run without opening AmoxSQL: from a console, from a script, or at a set time with the Windows Task Scheduler. It returns an exit code and leaves a log of what it did.

## What it is

```
AmoxSQL.exe run <process.sqlchain> --project <folder> [--param name=value]…
```

It is the same AmoxSQL, not a separate program: it uses your keychain credentials and your extensions. If AmoxSQL **is already open**, the command is handed to it and it runs there; if it **isn't**, it runs without a window and closes when it finishes. If you open AmoxSQL while it runs, the window opens and the run carries on.

Every run is recorded in the process history (Data Flow's **History** panel), just like the ones you start from the interface.

## When to use it

- A process that turns the month's Excel files into a Parquet file, and you want it to **run on its own** every Monday.
- Chaining it with other steps in a script: the exit code tells whether it went well.
- Running the same process with **another parameter** (another region, another month) without touching the flow.

## How to use it

### From a console: `amoxsql.cmd`
`AmoxSQL.exe` is a graphical application, and a console neither waits for it nor shows what it writes. That's why AmoxSQL installs an `amoxsql.cmd` next to it, which launches it, **waits**, shows the result and returns its code. It lives in the installation's `resources` folder; with the default installation:

```bat
"%LOCALAPPDATA%\Programs\AmoxSQL\resources\amoxsql.cmd" run flows\sales.sqlchain --project "C:\Projects\Sales 2026"
```

The output says how each step ended, how long it took and where the log is:

```
AmoxSQL: sales.sqlchain finished
  ok   Read sales (5 rows)
  ok   North only (3 rows)
  ok   To Parquet
  1.4 s
  Log: C:\Users\your-user\.amoxsql\registros\20261001-071500-3fa2b9c1.log
```

If you add that `resources` folder to your `PATH`, `amoxsql run …` is enough.

### Arguments

| Argument | What it is |
|---|---|
| `<process.sqlchain>` | The process. An absolute path, or relative to the folder you launch it from or to the project's |
| `--project <folder>` | The folder of the project it belongs to. Required |
| `--param name=value` | Changes one of the process's variables for this run. Can be repeated |

Parameters are the same `${name}` variables you define in the flow's **Variables**: `--param region=south` makes that run use `south` wherever the flow says `${region}`.

### Exit codes

| Code | Meaning |
|---|---|
| **0** | Finished well |
| **1** | The process failed (or stopped at a checkpoint, which needs someone to resume it) |
| **2** | The arguments aren't valid |
| **3** | A credential is missing on this machine (add it in **Settings → Credentials**), or a named source has no location here (set it in the **Sources** section of the database explorer) |
| **4** | AmoxSQL was open and didn't answer within 30 seconds |
| **5** | The project folder or the process file doesn't exist |

### At a set time: the Windows Task Scheduler
1. Open **Task Scheduler** and choose **Create Basic Task**.
2. Give it a name (for example, *Weekly sales*) and a trigger: **Weekly**, Monday at 7:00.
3. Under **Action**, choose **Start a program**:
   - **Program/script:** `%LOCALAPPDATA%\Programs\AmoxSQL\resources\amoxsql.cmd`
   - **Add arguments:** `run flows\sales.sqlchain --project "C:\Projects\Sales 2026"`
4. Finish the wizard. The task's **History** shows the exit code of every run: `0` means it went well.

The task runs as your user, so it uses your keychain credentials. Scheduling from inside the application comes in a later version.

## Reference: where things end up

| What | Where |
|---|---|
| Each run's log | `~/.amoxsql/registros/<id>.log` — one per run, readable |
| The history | AmoxSQL's own database; shown in **History** inside the flow |
| Intermediate steps | Wherever the flow says (see [where intermediate steps live](running-and-engine.md#where-intermediate-steps-live)). A file-to-file process doesn't touch the project database |

## Tips & gems

- **A flow in *Auto* or *Work database* doesn't need the project database**, so it can run even while another project is open in AmoxSQL.
- **If the flow uses the project database** and that project isn't the one you have open, AmoxSQL opens its database separately: the one in `defaultDb` in `.amoxsql/project.json`, or the only `.duckdb` in the folder.
- **The credentials a project needs** are recorded by name in its manifest; if one is missing on this machine, the command exits with **3** before running anything, instead of failing halfway.
- **A checkpoint in a scheduled process** leaves it paused (code 1): resume it from **History**.

## Related

- [Data Flow](data-flow.md)
- [Running & engine](running-and-engine.md)
- [Node reference](node-reference.md)
