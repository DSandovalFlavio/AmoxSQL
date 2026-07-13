# ER diagram

**🌐 English · [Español](../../es/data/er-diagram.md)**

> An interactive visual map of your schema: tables, columns, primary and foreign keys connected with lines, with zoom, pan, and one-click DDL generation.

<img src="../../../images/10_er_diagram.png" alt="AmoxSQL ER diagram" width="100%" />

## What it is

The ER (entity-relationship) diagram draws a schema's tables as cards, each with its columns, types, and primary-key (PK) and foreign-key (FK) markers. Relationships are drawn as curves between columns, with an arrow pointing to the referenced table.

It's an interactive canvas: you can zoom, pan, rearrange tables by dragging, and highlight a table's relationships on hover. It's generated automatically from the real database structure — no hand-drawing required.

It's scoped to one schema. You open it from the [Database explorer](database-explorer.md), with a button per schema.

## When to use it

- To understand at a glance how a schema's tables relate.
- To locate primary and foreign keys and what points to what.
- To get a table's DDL from the diagram.
- If you only need to browse tables/columns or insert names, the [Database explorer](database-explorer.md) is more direct.

## How to use it

### Open the diagram
1. In the [Database explorer](database-explorer.md), click the diagram button (flow icon): in the header for single-schema databases, or on each schema row in multi-schema ones.
2. Tables auto-lay out in a grid and FK relationships are drawn between them.

### Navigate the canvas
- **Zoom:** mouse wheel, or the **+** / **−** buttons in the toolbar.
- **Pan:** drag on the empty background.
- **Rearrange:** drag a table card to move it.
- **Reset:** the fit button restores zoom, position, and layout.
- **Highlight relationships:** hover a table to emphasize its connections and dim the rest.

### Generate DDL
1. Click a table to select it (a panel appears with its summary: columns, PK, FK).
2. Use **Copy DDL** to copy its `CREATE TABLE` (with NOT NULL, PRIMARY KEY, and FOREIGN KEY) to the clipboard.
3. Or **Open in Editor** to send the DDL to a new SQL tab.

## Reference

### Toolbar
| Control | What it does |
|---|---|
| Zoom + / − | Zooms the diagram in or out |
| Reset / Fit | Restores zoom, pan, and auto-layout |
| Copy DDL | Copies the selected table's `CREATE TABLE` |
| Open in Editor | Sends the DDL to a new SQL tab |
| Refresh | Re-reads the schema's structure |
| Counter | Shows number of tables · relations · zoom % |

### Card markers
| Marker | Meaning |
|---|---|
| Key | Primary key (PK) |
| Link | Foreign key (FK) |
| Eye | The entity is a view |
| Curve with arrow | FK relationship → referenced table |

## Tips & gems

- **Hover highlight:** hovering a table lights up only its relationships, handy in dense schemas.
- **Smart auto-layout:** tables are placed in a grid sized to their columns; reset recomputes positions.
- **Faithful DDL:** the generated `CREATE TABLE` includes nullability, PK, and detected FKs — good for documenting or migrating.
- **One diagram per schema:** in multi-schema databases you open the ER for whichever schema you want from its row.

## Related

- [Database explorer](database-explorer.md) · [File explorer](file-explorer.md)
- [SQL editor](../editor/sql-editor.md) · [Importing data](importing-data.md)
