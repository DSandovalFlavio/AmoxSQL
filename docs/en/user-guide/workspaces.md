# Workspaces: grouping projects

**🌐 English · [Español](../../es/user-guide/workspaces.md)**

> A workspace groups the projects of one client, team, brand or product. It lives in AmoxSQL, not in a folder: your project folders are linked to it.

## What it is

Up to 5.8, the interface called the folder you opened a *workspace*. Since 5.9 that folder is a **project**, and a *workspace* is what groups several projects. Nothing moved on disk: every folder you had is still there, as a project.

Each user picks **what to call them**: *Clients*, *Teams*, *Brands*, *Products* or *Workspaces*. That word is the one you'll see throughout the app — "New client", "Which team does this project belong to?" — and the one the AI assistant uses when it talks about the group.

## When to use it

- An agency or a consultancy: one workspace per client, with all its projects.
- Several areas in one company: one workspace per team.
- When you want the assistant to know who the analysis is for.

## How to use it

### Pick the word
The first time you open 5.9, AmoxSQL asks how you organize your work. You can change it anytime in **Settings**, in the section that carries that name (for example, **Settings → Clients**).

### Create one
In that same Settings section, **New client** (or the word you picked): a name, an optional tag (*Retail*, *Health*…) and a color. You can also create one while linking a folder.

### Link a folder
- **When you open it:** if the folder isn't linked and you already have a workspace, AmoxSQL asks which one it belongs to. Pick one, create another, or **Leave unlinked**; with **Don't ask again for this project** it won't ask again for that folder.
- **Later:** from the project menu in the title bar, **Client: …  Change** (or **Link to a client…**).

Once linked, the title bar shows the workspace before the project: `Northern Stores / sales-q4 / database`.

### Rename and archive
In Settings, each workspace has **edit** (name, tag, color) and **archive**. An archived one leaves the list and the questions on open, but it isn't deleted: **Show archived → Restore** brings it back.

### The workspaces view (from the welcome screen)
The welcome screen doesn't change: opening a path, the recent projects and the footer stay the same. Once you have a workspace, a button with your word — for example **Clients 4** — appears in the recent projects header. It leads to a separate screen, with **Welcome** at the top to go back:

- **Overview:** what ran recently (from the interface or the command line) with its workspace, one card per workspace — its projects by status, the next due date and its AI policy — and the projects that don't have a workspace yet, which you can link right there without opening them.
- **A workspace:** its projects with their **status** (*In progress*, *In review*, *Delivered*, *Paused*) and **due date**, editable in the table; what ran; and the **Context**, **Edit** and **Export** buttons.
- **Unassigned** and **Archived**, plus a search by name and folder across all projects.

Status and due date are saved in the folder's `project.json`, so they travel with it.

### Sharing a workspace: export and import
**Export** saves a `.amoxworkspace` file with its details, AI policy, brand (logo included), context files and the **names** of the credentials its projects use — never their values. **Import…** (in the view) brings it in:

- If it isn't here, it's created with the **same id**, so folders linked on another machine recognize it.
- If it already exists, new files are added and you choose which different ones to replace; optionally the name, color, policy and brand too. Or import it separately, as another workspace.
- It tells you which credentials to add in **Settings → Credentials**.

## Reference: what is saved and where

| What | Where |
|---|---|
| The workspace (name, tag, color, AI policy, brand) | AmoxSQL's database, in `~/.amoxsql/amoxsql.duckdb` |
| Its context (rules, metrics, glossary, examples, skills) | `~/.amoxsql/workspaces/<id>/` |
| A folder's link, status and due date | Its `.amoxsql/project.json`: `workspace: { id, nombre }`, the project's `id`, `estado` and `entrega` |
| A workspace to share | A `.amoxworkspace` file (JSON), with no credential values |

## Tips & gems

- **The link travels with the folder.** If you share it or open it on another machine that doesn't have that workspace, AmoxSQL tells you which one it belongs to and offers to **create it with the same id**, so the link keeps working.
- **Moving the folder breaks nothing:** AmoxSQL recognizes the project by its `id`, not by its path.
- **With no workspaces, nothing is asked.** If you don't use them, AmoxSQL doesn't bother you when opening folders.
- Renaming a workspace updates the name in its folders' `project.json` the next time you open them.

## Related

- [Projects & connections](projects-and-connections.md)
- [Glossary](../reference/glossary.md)
