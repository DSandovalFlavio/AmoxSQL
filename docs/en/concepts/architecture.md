# Architecture

**🌐 English · [Español](../../es/concepts/architecture.md)**

> How AmoxSQL is built inside, at a high level: three cooperating processes, a local DuckDB engine with connection lanes, and communication over local HTTP.

> This page is a conceptual view for technical users. Implementation details live in the internal docs ([docs/dev/arquitectura.md](../../dev/arquitectura.md)).

## Three processes

AmoxSQL is a desktop app with three cooperating processes:

1. **Main process (desktop shell)** — owns the window, native dialogs, and window controls. It launches the local server as a sub-process on a dynamic port.
2. **Local server** — exposes a REST API and holds the DuckDB connection. The interface talks to it over **local HTTP** (no external network traffic). Every data operation — queries, imports, exports, AI — goes through here.
3. **Interface (renderer)** — the SPA you see. It communicates with the server over HTTP; the shell only exposes a minimal bridge for native dialogs and window controls.

The server port is assigned dynamically (prefers a standard one, falls back to a free one if busy), so you can run several instances without clashes.

## DuckDB engine with lanes

The engine is a single DuckDB instance, but with **three independent connection lanes** over that instance:

| Lane | For |
|---|---|
| **main** | Your queries, exports, and Data Flow runs |
| **meta** | Autocomplete and schema probes — keeps the editor responsive even while a long query runs |
| **ai** | AI queries + history bookkeeping |

Separating lanes prevents, for example, autocomplete or the AI from queuing behind a heavy query of yours. They all share the same catalog (tables you attach or create are visible in all three).

## Why it matters to you
- **It's local:** no remote server, no network latency. Reason about DuckDB as instant (see [Local-first](local-first.md)).
- **Responsive:** the editor and AI don't stall on your queries thanks to the lanes.
- **When debugging "works in dev but not in the build":** it's almost always (a) the local server didn't start, or (b) the interface's load path.

## Related
- [Local-first](local-first.md) · [Projects & connections](../user-guide/projects-and-connections.md)
- [DuckDB extensions](../data/duckdb-extensions.md)
