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
   - **When a file arrives.** When a new file lands in a [folder source](../data/sources.md) («the client drops the Excel at 9:40 instead of 7:00»). It waits a minute after the last file, so ten files at once are one run. **Only while AmoxSQL is open with that project**: watching folders is something the open application does.
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

## Scheduling dbt

A dbt command is scheduled just like a process. In [DBT Studio](../dbt/dbt-studio.md) → **Commands**, type the command (for example `dbt build --select +fct_sales`) and click the calendar button next to **Execute**: the same **Schedule…** opens, with the same rules, notifications and catch-up.

- It runs with the project's dbt environment and target, with its [AmoxSQL sources](../dbt/amoxsql-sources-in-dbt.md), and releases the database if AmoxSQL has it open.
- Its name is the command ("dbt build +fct_sales"), and in Operations and in the run's record it is one more run: each model and test is a step.
- With **Notify me: only on failure**, a test in *warn* also notifies ("…: tests with warnings"), even though dbt ends fine.
- A command with shell syntax (`&&`, `|`…) or a folder without `dbt_project.yml` can't be scheduled.

## When something fails: Needs attention

What ran with nobody watching (scheduled, from the command line or in a batch) and **failed or finished with a warning** shows up in **Needs attention**, with the reason in one line:

- on the **welcome screen**, from every workspace (only when there's something; otherwise the welcome screen stays as usual);
- at the top of **each workspace's page**, only its own.

Each row has **Open** (the run's record), **Run again** and **Dismiss**. It leaves the list when you open its record, click Dismiss, or when the next run of the same process finishes fine. The Operations button in the title bar turns red with what's left to look at, not just today's: a failure at 5:00 is still in sight when you arrive.

## Background runs stay out of the way

With AmoxSQL **open**, what runs with nobody watching uses at most **half the cores and 25% of the memory**: you can keep working meanwhile, and the process itself usually finishes sooner because it competes less. Whatever doesn't fit in that memory goes to disk instead of failing.

- With AmoxSQL **closed** (the Windows task wakes it up), there are no limits: nobody is working.
- If AmoxSQL catches up on missed runs when you open it, that catch-up does get the limits.
- Change the percentages in **Operations** ("While you work, a scheduled run uses up to…").
- The run's record says which limits it ran with. A process that uses the **project database** isn't limited (it would share the limits with your session), and the record says so.
- Scheduled dbt runs at low priority.

## If the network fails

Steps that read from the network (a web address, a bucket, an online spreadsheet, a cloud source) **retry a passing failure**: timeout, cut connection, busy server (429, 5xx). By default, **twice, 30 seconds apart** when the process runs scheduled, and never from the interface. Each step changes it under **If the network fails**. A missing file or a permission error isn't retried: waiting doesn't fix it. The run's record counts each step's retries.

## Operations: everything in one place

**Operations** shows everything scheduled on this computer, from every group. Open it from the button with today's count in the title bar (red if something failed today), from the **AmoxSQL** menu, or from the workspaces view.

- **Today and tomorrow.** What ran (finished, failed) and what is still due, in order.
- **Schedules.** Grouped by group, with **Run now** and **Pause**.
- **Log.** The recent runs of every project: all, only scheduled, or only failed. A click opens the run's details.
- **Pause everything until a date** before a holiday. Nothing scheduled runs until then, and what was due is not caught up. **Resume now** lifts the pause.
- The switch **Run even when AmoxSQL is closed**.

## Business days and holidays

«The first business day» uses the **calendar of the group** of projects: its working days and its holidays. You set it in the group's page in the workspaces view, under **Working days and holidays**. It travels with the group (`.amoxworkspace`). A project without a group uses Monday to Friday, with no holidays.

## Tips & gems

- **Name the output with dates:** `close_{fecha:AAAA-MM}.xlsx` in a [destination](../data/sources.md) keeps every month's file.
- **Notifications:** one line per run («Monthly close · 3 files read, 1 saved · 4 s»), or the step where it failed and why.
  - With AmoxSQL open, clicking one opens **the run's details**: how it went, when and how it was launched, its parameters, the files it left (with **Open** and **Show in folder**), and each step with its rows and time. **Run again** repeats it with the same values; a scheduled run is repeated with the date it was due.
  - If it ran with AmoxSQL closed, the run is in the history when you open it.
- **Pause everything before a holiday:** pause each schedule, or the Windows task keeps waking AmoxSQL but nothing runs while the general pause lasts.
- **From the command line:** `AmoxSQL.exe tick` runs what's due right now; it's what the Windows task calls.

## Related

- [Command line](command-line.md)
- [Parameters and batches](data-flow.md)
- [Excel output](excel-output.md)
