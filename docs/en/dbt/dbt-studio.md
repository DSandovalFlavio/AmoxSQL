# DBT Studio

**🌐 English · [Español](../../es/dbt/dbt-studio.md)**

> AmoxSQL's panel for working with dbt projects on DuckDB: detect your environment, edit configuration, generate models and sources, build and run commands, and visualize lineage — without leaving the app.

<img src="../../../images/08_dbt_studio.png" alt="DBT Studio in AmoxSQL" width="100%" />

## What it is

**DBT Studio** is an integrated panel for managing a dbt project that runs on DuckDB. Instead of jumping to a terminal, you get an interface with six sections — Setup, Config, Models, Sources, Commands, and Lineage — covering the workflow: prepare the environment, configure profiles, create models and sources, run commands, and see how your models connect.

AmoxSQL doesn't bundle dbt: it detects it on your system (Python + dbt, optionally via Conda/Mamba) and runs the dbt command line for you, streaming the output live. The project's code and files (`profiles.yml`, `dbt_project.yml`, your `.sql` models, and source YAMLs) live in your project as usual.

You switch sections with the tabs at the top of the panel. The **Lineage** section can also open in its own full-screen tab.

## When to use it

- When your analysis uses **dbt to transform** data in DuckDB and you want to manage it from AmoxSQL.
- To **bootstrap a dbt project** fast: detect the environment, initialize the project, and configure the DuckDB profile.
- To **scaffold** models (staging, intermediate, mart, incremental) and sources without hand-writing YAML.
- To **run dbt commands** (`run`, `build`, `test`…) with a visual builder and see the result with its exit code.
- To **understand dependencies** between models with the lineage graph.

If you just want to run raw SQL against DuckDB, use the [SQL editor](../editor/sql-editor.md); DBT Studio is for projects that use dbt.

## How to use it

### 1. Setup (prepare the environment)
1. In the **Environment** card, hit refresh to detect **Python**, **dbt**, **Conda**, and **Mamba**; each shows a green/red dot and its version.
2. If you use Conda, pick an **environment** in the selector; DBT Studio marks the ones that have dbt installed and checks their exact version.
3. In the **Project** card, refresh to detect an existing dbt project. If there's none, type a name and hit **Initialize Project** to create one.

### 2. Config (configure the project)
1. Edit `profiles.yml` with form fields: profile name, target, threads, DuckDB file path, and schema. Hit **Save Profile** to write it.
2. The `dbt_project.yml` card shows a summary (name, version, profile, model paths).

### 3. Models (generate models)
1. Choose a **template**: staging, intermediate, mart, incremental, or basic. The default path and materialization adjust automatically to the template.
2. Type the model name and, if you want, tweak path, materialization, schema, and description.
3. Hit **Create Model**; the file is created and opened in the editor.

### 4. Sources (define sources)
1. Type the source name and, optionally, the schema.
2. Add one or more **tables** (name + description). Use **Add Table** for more rows.
3. Hit **Create Source**; the source YAML is generated and a preview appears that you can copy.

### 5. Commands (run dbt)
1. Use the **quick actions** (Run All, Compile, Test, Debug) or the **command builder**.
2. In the builder, choose the action (`run`, `build`, `compile`, `test`, `seed`, `snapshot`, `debug`, `clean`, `deps`, `parse`) and add flags: `--select`, `--exclude`, `--target`, and, for run/build, `--full-refresh`.
3. The final command shows below (prefixed with `conda run -n <env>` if an environment is selected). **Copy** it to the clipboard or hit **Execute**.
4. Output streams live in the **Output** panel, with an **exit-code** badge when it finishes (green if 0, red otherwise).

### 6. Lineage
1. Open the **Lineage** section (or the **Open in tab** button to see it full-screen).
2. The graph is built from the project's `manifest.json`; if it doesn't exist, run `dbt compile` first.
3. Nodes are **color-coded by type** (source, seed, model, snapshot…), with type and materialization badges. Hover to highlight connections and see details; **click** a node to open its file.
4. Use the **zoom** controls and drag to pan; **Reset View** returns to the initial framing.

## Section reference

| Section | What it does |
|---|---|
| **Setup** | Detects Python/dbt/Conda/Mamba, selects the Conda environment, detects or initializes the project |
| **Config** | Edits `profiles.yml` (DuckDB profile) and shows a `dbt_project.yml` summary |
| **Models** | Model generator: staging, intermediate, mart, incremental, basic |
| **Sources** | Source-definition generator (YAML) with one or more tables |
| **Commands** | dbt command builder with flags, streamed execution, and an exit-code badge |
| **Lineage** | Graph (DAG) from `manifest.json`, color-coded by type; click to open the file |

### Available command actions
| Action | Typical use |
|---|---|
| `run` · `build` | Build models (with optional `--full-refresh`) |
| `compile` · `parse` | Compile/parse the project (generates the manifest) |
| `test` | Run the tests |
| `seed` · `snapshot` | Load seeds · take snapshots |
| `debug` · `deps` · `clean` | Diagnose · install dependencies · clean artifacts |

## Tips & gems

- **State is cached locally:** environment and project detection are saved between sessions, so the panel opens instantly; refresh with the buttons when your environment changes.
- **First-class Conda:** if Conda isn't on the PATH, DBT Studio tries to locate it and tells you where it found it; the selector marks the environments that ship dbt.
- **Lineage needs the manifest:** the graph reads from `manifest.json`; if you see "No manifest found", run `dbt compile` (or `run`) from the Commands section first.
- **From graph to code in one click:** clicking a lineage node opens its `.sql` file in the editor — great for navigating a large project.
- **The template sets the materialization:** picking staging/intermediate proposes `view`; mart proposes `table`; incremental proposes `incremental`. You can change it before creating.
- **Commands respect your environment:** if you select a Conda environment, both the copied command and the execution prefix it with `conda run -n <env>`.

## Shortcuts & related formats

| Format / file | Detail |
|---|---|
| `profiles.yml` | dbt connection profile (here, the DuckDB adapter) |
| `dbt_project.yml` | dbt project configuration |
| `manifest.json` | Compiled artifact the lineage is read from |
| `.sql` models, `.yml` sources | Files produced by the generators |

## Related

- [SQL editor](../editor/sql-editor.md) · [File explorer](../data/file-explorer.md)
- [Data Flow](../data-flow/data-flow.md) · [ER diagram](../data/er-diagram.md)
