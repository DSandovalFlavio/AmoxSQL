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

## Reference: what is saved and where

| What | Where |
|---|---|
| The workspace (name, tag, color) | AmoxSQL's database, in `~/.amoxsql/amoxsql.duckdb` |
| Its context folder | `~/.amoxsql/workspaces/<id>/` (shared context and rules will fill it) |
| A folder's link | Its `.amoxsql/project.json`: `workspace: { id, nombre }` and the project's `id`. Nothing else |

## Tips & gems

- **The link travels with the folder.** If you share it or open it on another machine that doesn't have that workspace, AmoxSQL tells you which one it belongs to and offers to **create it with the same id**, so the link keeps working.
- **Moving the folder breaks nothing:** AmoxSQL recognizes the project by its `id`, not by its path.
- **With no workspaces, nothing is asked.** If you don't use them, AmoxSQL doesn't bother you when opening folders.
- Renaming a workspace updates the name in its folders' `project.json` the next time you open them.

## Related

- [Projects & connections](projects-and-connections.md)
- [Glossary](../reference/glossary.md)
