# Configuration

**🌐 English · [Español](../../es/reference/configuration.md)**

> AmoxSQL's Settings modal: appearance, editor, behavior, AI, store integrations, workspace, shortcuts, tours, and About — all in one place.

<img src="../../../images/09_settings_modal.png" alt="AmoxSQL Settings modal" width="100%" />

## What it is

Settings is AmoxSQL's central configuration panel. Open it with **Ctrl+,** (or the gear in the bar); it groups every preference into tabs on the left. A search box at the top filters the tabs by name.

The tabs fall into two blocks: **Configure** (Appearance, Editor, Behavior, AI, Store Integrations, Workspace) and **Help & info** (Shortcuts, Story Flow, Data Flow, About). Most changes apply live.

Configuration persists to `~/.amoxsql/config.json`; UI preferences are also stored in `localStorage` (see [Where configuration is stored](#where-configuration-is-stored)).

## How to use it

1. Open Settings with **Ctrl+,** or the gear.
2. Pick a tab in the left column (or type in the search box to filter them).
3. Adjust options; changes take effect instantly.
4. Close with **Escape** or the close button.

## Appearance

Controls the app's visual look. See [Themes & appearance](../user-guide/themes-and-appearance.md).

| Option | What it controls |
|---|---|
| Theme | Light/dark mode and the Amox Dark/Light themes |
| Accent color | The UI's emphasis color |
| UI font | Interface typography |
| UI zoom | Global interface scale (also via Ctrl +/-/0) |

## Editor

Configures the [SQL editor](../editor/sql-editor.md). Changes apply to the editor live.

| Option | What it controls |
|---|---|
| Font family & size | Code typography (6 bundled families) |
| Minimap | Navigation map on the right |
| Word wrap | Line wrapping |
| Line numbers | Show/hide |
| Tab size | Indentation width |
| Mouse-wheel zoom | Ctrl + wheel to zoom in/out |
| Bracket-pair colorization | Color matched brackets |
| Indent guides | Vertical indentation lines |
| Cursor style/blink | Cursor appearance |
| Formatting style | SQL formatter rules (keyword case, lines between queries…) |

## Behavior

Workflow preferences.

| Option | What it controls |
|---|---|
| Auto-save | Save files automatically as you edit |
| Welcome screen | Show or hide the welcome screen on launch |
| Default data-file action | What AmoxSQL does when you open a CSV/Parquet/Excel (e.g. preview, import) |

## AI

Configures the assistant's providers, keys, and models. See [Providers & models](../ai/providers-and-models.md).

| Option | What it controls |
|---|---|
| Active provider | Ollama (local) or cloud: Google Gemini, Anthropic, OpenAI, Google Vertex |
| API keys | Credentials per cloud provider |
| Model | Model to use per provider (Ollama's are discovered locally) |
| Parameters | Per-model settings based on its capability profile |

> API keys are stored in your local `config.json`; they never leave your machine except toward the provider you choose.

## Store Integrations

Connect cloud storage for importing and exporting data. See [Google Sheets](../data/google-sheets.md) and [Exporting data](../data/exporting-data.md).

| Integration | What it enables |
|---|---|
| S3 | Read/write data on S3-compatible storage |
| GCS | Read/write data on Google Cloud Storage |
| Google Sheets | Import/export Google Sheets spreadsheets |

## Workspace

A wizard for setting up the active project/workspace (paths, database, context). See [Projects & connections](../user-guide/projects-and-connections.md).

| Option | What it controls |
|---|---|
| Workspace wizard | Step-by-step guide to configure the active project |

## Shortcuts

A reference-only tab with the complete keyboard-shortcut set, grouped by category. It's the same content as [Keyboard shortcuts](keyboard-shortcuts.md).

## Story Flow

Help and tour reset for the visualization section. See [Story Flow](../visualization/story-flow.md).

| Option | What it controls |
|---|---|
| Reset Story Flow tour | Shows the guided walkthrough again next time you enter |

## Data Flow

Help and tour reset for the pipeline editor. See [Data Flow](../data-flow/data-flow.md).

| Option | What it controls |
|---|---|
| Reset Data Flow tour | Shows the guided walkthrough again next time you enter |

## About

App information: version, author, license, and links. No configurable options.

## Where configuration is stored

| Location | What it holds |
|---|---|
| `~/.amoxsql/config.json` | Main configuration: AI providers/keys, integrations, server preferences |
| `localStorage` | Renderer UI preferences (see below) |

Main `localStorage` keys (high level):

| Key | Stores |
|---|---|
| `amoxsql-theme` · `amoxsql-accent` | Theme and accent color |
| `amoxsql-ui-font` · `amoxsql-ui-zoom` | UI font and zoom |
| `amoxsql-editor-settings` · `amoxsql-editor-layout` | Editor preferences and layout |
| `amoxsql-formatter-config` | SQL formatter style |
| `amoxsql-recent-projects` | Recent projects |
| `amoxsql-*-tour-seen` | Tour-seen flags (getting-started, Story Flow, Data Flow, etc.) |

## Tips & gems

- **Search Settings:** the top search field filters tabs by name — handy when you can't recall where an option lives.
- **Reset a tour anytime:** the Story Flow and Data Flow tabs let you replay the guided walkthrough.
- **Config is portable:** since it's a JSON in `~/.amoxsql/`, you can back it up or version it.

## Related

- [Themes & appearance](../user-guide/themes-and-appearance.md) · [SQL editor](../editor/sql-editor.md)
- [Providers & models](../ai/providers-and-models.md) · [Keyboard shortcuts](keyboard-shortcuts.md)
- [Projects & connections](../user-guide/projects-and-connections.md) · [File formats](file-formats.md)
