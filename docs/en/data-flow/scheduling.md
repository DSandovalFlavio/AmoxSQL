# Scheduling processes

**🌐 English · [Español](../../es/data-flow/scheduling.md)**

> A process runs by itself at the time it's due: «the monthly close, on the first business day of each month at 7:00». If the computer was off, AmoxSQL catches up when it comes back.

<!-- 📷 CAPTURE: docs/images/data-flow/schedule-dialog.png — the Schedule dialog with "Every month · the first business day · 07:00" and its next five dates -->

## What it is

A schedule says **which process**, **when**, **with which parameters** and **who gets notified**. It belongs to **this computer**: it lives in AmoxSQL's own database, not in the `.sqlchain`. That's why copying the project to another computer doesn't make it run twice there.

## When to use it

- A report that someone expects at the same time every day, week or month.
- A process that refreshes data during the working day, every few hours.
- Anything you'd otherwise remember to run by hand.

## How to use it

1. Open the process in Data Flow and choose **⋯ → Schedule…** (or **Schedule…** in the process's form).
2. Choose how often:
   - **Every day.** On the days you tick, or only on business days.
   - **Every week.** On one day.
   - **Every month.** On a day of the month (day 31 becomes the last day in shorter months), on the **first** or **last business day**, or on the **Nth business day**.
   - **Every few hours.** Every 1 to 12 hours within a time window.
3. Set the time. The dialog shows the next five dates while you write the rule.
4. Give its **parameters** values. For a date, **The day it was due** uses the date of each run: September's close that runs on October 2nd still gets September's date.
5. Choose **Notify me** (every time, only if it fails, never), and whether it **catches up** after the computer was off.
6. Press **Schedule**.

Each schedule shows in a sentence when it runs next and how the last run went, with **Run now**, **Pause** and **Remove**.

## When it runs

- **With AmoxSQL open**, it checks every minute what is due.
- **When AmoxSQL opens**, it catches up. For each schedule it runs **only the latest** missed occurrence and says how many were missed («2 earlier runs were missed»). It never runs one more than 7 days old. Without **Catch up**, a missed one is skipped and the message says so.
- **With AmoxSQL closed:** tick **Run even when AmoxSQL is closed** at the bottom of the dialog (off by default).
  - AmoxSQL then creates **one** task in the Windows Task Scheduler. It wakes AmoxSQL at the next due time and is rewritten after every run.
  - The task runs as you, with no password and no administrator rights, **only while you're signed in to Windows**. If the computer was off, it runs when you sign in.
  - Untick the option and the task is removed.

The same occurrence never runs twice, whoever triggers it (the open app or the Windows task). If the previous run of a schedule is still going, the next one is skipped and the message says so.

## Business days and holidays

«The first business day» uses the **calendar of the group** of projects: its working days and its holidays. You set it in the group's page in the workspaces view, under **Working days and holidays**. It travels with the group (`.amoxworkspace`). A project without a group uses Monday to Friday, with no holidays.

## Tips & gems

- **Name the output with dates:** `close_{fecha:AAAA-MM}.xlsx` in a [destination](../data/sources.md) keeps every month's file.
- **Notifications:**
  - With AmoxSQL open, clicking one opens the run.
  - If it ran with AmoxSQL closed, the run is in the history when you open it.
- **Pause everything before a holiday:** pause each schedule, or the Windows task keeps waking AmoxSQL but nothing runs while the general pause lasts.
- **From the command line:** `AmoxSQL.exe tick` runs what's due right now; it's what the Windows task calls.

## Related

- [Command line](command-line.md)
- [Parameters and batches](data-flow.md)
- [Excel output](excel-output.md)
