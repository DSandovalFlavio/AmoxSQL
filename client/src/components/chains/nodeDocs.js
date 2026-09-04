/**
 * nodeDocs — Single source of truth for per-node documentation.
 *
 * Both the config panel's "Info" tab and the palette's "?" popover render from
 * this map, so docs stay consistent and live in one place. Keep entries concise
 * and task-oriented — the audience is analysts and data scientists, not engineers.
 *
 * Shape per node:
 *   summary    — one line, what it's for
 *   whatItDoes — short paragraph
 *   io         — { in, out } human description of inputs/outputs
 *   options    — [{ name, desc }] each configurable field
 *   examples   — ['short use case', …]
 *   tips       — ['gotcha or best practice', …]
 */
export const NODE_DOCS = {
    // ── Data Sources ─────────────────────────────────────────────
    import_file: {
        summary: 'Load a single local file (CSV, TSV, Parquet, JSON, Excel) into a table.',
        whatItDoes: 'Reads one file from disk and materializes it as a DuckDB table you can build on. Column types are auto-detected.',
        io: { in: 'None — this is a starting node.', out: 'A table named after "Table Name".' },
        options: [
            { name: 'Source Path', desc: 'Path to the file. You can drag a file from the File Explorer onto the field.' },
            { name: 'File Type', desc: 'csv, tsv, parquet, json or xlsx. Usually auto-detected from the extension.' },
            { name: 'Table Name', desc: 'Name of the resulting table. Defaults to "imported_data".' },
        ],
        examples: ['Load sales.csv to start an analysis.', 'Read a Parquet export from another tool.'],
        tips: ['Excel (.xlsx) needs the spatial extension — it installs automatically the first time.'],
    },
    import_folder: {
        summary: 'Load and stack every matching file in a folder into one table.',
        whatItDoes: 'Reads all files matching a pattern (e.g. *.csv) and unions them by column name — ideal for monthly exports or partitioned dumps.',
        io: { in: 'None — starting node.', out: 'One combined table.' },
        options: [
            { name: 'Folder Path', desc: 'Directory containing the files.' },
            { name: 'File Pattern', desc: 'Glob like *.csv or 2025-*.parquet.' },
            { name: 'Table Name', desc: 'Name of the combined table.' },
        ],
        examples: ['Combine data/2025-01.csv … 2025-12.csv into one table.'],
        tips: ['Files are unioned by column name, so slightly different column orders are fine.'],
    },
    table_ref: {
        summary: 'Reference a table or view that already exists in the database.',
        whatItDoes: 'Points at an existing table/view and passes it downstream — no copy is made. Use it as the entry point when the data is already loaded.',
        io: { in: 'None — starting node.', out: 'The referenced table, unchanged.' },
        options: [
            { name: 'Table / View Name', desc: 'Pick from existing tables or type a name.' },
        ],
        examples: ['Feed an existing customers table into a join.'],
        tips: ['Nothing is duplicated — downstream nodes read the live table.'],
    },
    http_fetch: {
        summary: 'Read a file directly from a public URL.',
        whatItDoes: 'DuckDB streams a CSV/Parquet/JSON straight from an http(s) URL into a table, no manual download needed.',
        io: { in: 'None — starting node.', out: 'A table from the remote file.' },
        options: [
            { name: 'URL', desc: 'Must start with http:// or https://.' },
            { name: 'Format', desc: 'csv, parquet or json.' },
            { name: 'Table Name', desc: 'Name of the resulting table.' },
        ],
        examples: ['Pull a public dataset CSV by URL.'],
        tips: ['Needs internet and the httpfs extension (auto-installed). For private buckets use Cloud Bucket instead.'],
    },
    bucket_read: {
        summary: 'Read CSV/Parquet/JSON from an S3 or GCS bucket.',
        whatItDoes: 'Reads cloud object storage directly into a table using credentials saved in Settings. Glob patterns let you load many files at once.',
        io: { in: 'None — starting node.', out: 'A table from the cloud file(s).' },
        options: [
            { name: 'Bucket URI', desc: 's3://bucket/path or gs://bucket/path. The provider is detected from the scheme.' },
            { name: 'Format', desc: 'parquet, csv or json.' },
            { name: 'Table Name', desc: 'Name of the resulting table.' },
        ],
        examples: ['s3://reports/2025/*.parquet to load a year of partitioned files.'],
        tips: ['Configure credentials in Settings → Cloud first, or you get an auth error.', 'Glob patterns like *.parquet are supported.'],
    },
    gsheet_read: {
        summary: 'Read a Google Sheet tab into a table.',
        whatItDoes: 'Pulls a sheet (optionally a specific tab) into a DuckDB table using a Google service-account key configured in Settings.',
        io: { in: 'None — starting node.', out: 'A table from the sheet.' },
        options: [
            { name: 'Spreadsheet ID or URL', desc: 'Paste the full Sheets URL or just the ID — the ID is extracted automatically.' },
            { name: 'Sheet / Tab Name', desc: 'Optional. The tab to read; defaults to the first sheet.' },
            { name: 'Table Name', desc: 'Name of the resulting table.' },
        ],
        examples: ['Read the "Targets" tab of a planning spreadsheet.'],
        tips: ['The service account must have read access to the sheet (share it with the account email).'],
    },

    // ── SQL ──────────────────────────────────────────────────────
    sql_inline: {
        summary: 'Run any DuckDB SQL you type.',
        whatItDoes: 'An escape hatch for anything the visual nodes do not cover. The query result becomes this node\'s output.',
        io: { in: 'Optional — upstream tables are referenceable by name.', out: 'The query result.' },
        options: [
            { name: 'Query', desc: 'Any valid DuckDB SQL (SELECT, WITH, etc.).' },
        ],
        examples: ['Complex CTEs, UNNEST tricks, or functions no node exposes.'],
        tips: ['Prefer visual nodes when possible — they validate and document themselves. Reach for SQL when you truly need it.'],
    },
    sql_file: {
        summary: 'Run SQL from a .sql file in the project.',
        whatItDoes: 'Executes a saved .sql file as-is. Good for reusing or version-controlling a query.',
        io: { in: 'Optional.', out: 'The query result.' },
        options: [
            { name: 'File Path', desc: 'A .sql file in the project. You can create one inline.' },
        ],
        examples: ['Reuse a vetted query kept under version control.'],
        tips: ['Edits to the file are picked up on the next run.'],
    },

    // ── Filter & Order ───────────────────────────────────────────
    filter: {
        summary: 'Keep only the rows that match your conditions.',
        whatItDoes: 'Applies one or more WHERE conditions, combined with AND/OR. Supports comparisons, LIKE, IN, BETWEEN and NULL checks.',
        io: { in: '1 upstream table.', out: 'Same columns, fewer rows.' },
        options: [
            { name: 'Conditions', desc: 'Each is column + operator + value. BETWEEN takes two values; IS NULL/IS NOT NULL take none.' },
            { name: 'Connector', desc: 'AND (all must match) or OR (any).' },
        ],
        examples: ['amount > 100 AND region IN (\'MX\',\'US\').', 'date BETWEEN \'2025-01-01\' AND \'2025-03-31\'.'],
        tips: ['Filter early in the pipeline — it shrinks everything downstream.'],
    },
    deduplicate: {
        summary: 'Remove duplicate rows, optionally by key columns.',
        whatItDoes: 'Drops duplicates. With key columns it keeps the first or last row per key; with none it removes fully identical rows.',
        io: { in: '1 upstream table.', out: 'Same columns, duplicates removed.' },
        options: [
            { name: 'Key Columns', desc: 'Columns that define "duplicate". Empty = whole-row match.' },
            { name: 'Keep', desc: 'first or last row within each duplicate group.' },
        ],
        examples: ['Keep the latest record per customer_id.'],
        tips: ['"Keep last" is most useful combined with an upstream Sort by timestamp.'],
    },
    sample: {
        summary: 'Take a subset of rows — a count, a percentage, or stratified.',
        whatItDoes: 'Reduces the data to a sample, handy for fast iteration on big tables or for balanced subsets.',
        io: { in: '1 upstream table.', out: 'A subset of rows.' },
        options: [
            { name: 'Sample Type', desc: 'rows (fixed count), percent, or stratified (per group).' },
            { name: 'Sample Value', desc: 'The count or percentage.' },
        ],
        examples: ['Grab 1,000 rows to prototype a chart quickly.'],
        tips: ['Sampling is non-deterministic by default — results vary between runs.'],
    },
    sort: {
        summary: 'Order rows by one or more columns.',
        whatItDoes: 'Sorts ascending or descending across multiple columns, in priority order.',
        io: { in: '1 upstream table.', out: 'Same rows, reordered.' },
        options: [
            { name: 'Sort Columns', desc: 'Each column + ASC/DESC. Listed top-to-bottom by priority.' },
        ],
        examples: ['Sort by date DESC, then amount DESC.'],
        tips: ['Pair with Deduplicate (keep last) to pick the most recent record per key.'],
    },

    // ── Columns ──────────────────────────────────────────────────
    select_columns: {
        summary: 'Choose which columns to keep, and optionally rename them.',
        whatItDoes: 'Projects a subset of columns, with optional aliases — the visual equivalent of SELECT a, b AS x.',
        io: { in: '1 upstream table.', out: 'Only the chosen columns.' },
        options: [
            { name: 'Columns', desc: 'Pick columns; set an alias to rename on the way out.' },
        ],
        examples: ['Keep id, name, total and drop the rest.'],
        tips: ['Trimming columns early keeps previews and exports clean.'],
    },
    add_column: {
        summary: 'Add new columns from expressions — with a no-code builder.',
        whatItDoes: 'Creates one or more derived columns. Use the chips to insert columns and common functions, or type SQL directly.',
        io: { in: '1 upstream table.', out: 'Original columns plus the new ones.' },
        options: [
            { name: 'New Columns', desc: 'Each has a name and an expression. The toolbar inserts columns and templates (ROUND, UPPER, CONCAT, CASE…).' },
        ],
        examples: ['total = price * quantity.', 'full_name = CONCAT(first, \' \', last).'],
        tips: ['You can reference a column created earlier in the same node.'],
    },
    rename_table: {
        summary: 'Rename the output table.',
        whatItDoes: 'Gives the upstream result a new table name — useful right before an Output node or to make downstream SQL readable.',
        io: { in: '1 upstream table.', out: 'Same data under a new name.' },
        options: [
            { name: 'New Name', desc: 'The new table name.' },
        ],
        examples: ['Rename a derived result to final_report.'],
        tips: ['This renames the table, not its columns — use Select Columns for column aliases.'],
    },
    type_cast: {
        summary: 'Convert columns to different data types.',
        whatItDoes: 'Casts columns to a target type (INTEGER, DOUBLE, DATE, VARCHAR…), optionally into a new column via an alias.',
        io: { in: '1 upstream table.', out: 'Same columns with adjusted types.' },
        options: [
            { name: 'Casts', desc: 'Each: column + target type, with an optional alias to keep the original.' },
        ],
        examples: ['Cast "2025-01-01" text to DATE.', 'price text → DOUBLE.'],
        tips: ['If a value can\'t be cast it errors — clean the column first if needed (see Clean / Date).'],
    },

    // ── Clean & Format ───────────────────────────────────────────
    clean: {
        summary: 'Standardize text: trim, case, replace, regex, fill nulls.',
        whatItDoes: 'Applies one or more cleaning operations per column to turn messy strings into consistent values.',
        io: { in: '1 upstream table.', out: 'Same columns, cleaned values.' },
        options: [
            { name: 'Operations', desc: 'Per column: trim, lower, upper, replace, regex_replace, fill_null, nullify_empty, regex_extract, normalize (strip accents + collapse spaces), split_part.' },
        ],
        examples: ['Trim + lowercase emails.', 'Normalize names with accents for matching.'],
        tips: ['Operations on the same column chain in order — e.g. trim then lower.'],
    },
    date_ops: {
        summary: 'Powerful date/time toolkit: parse, extract, truncate, format, add, diff, age.',
        whatItDoes: 'One node for all date work. Each operation outputs a column (or replaces the source when the alias matches it).',
        io: { in: '1 upstream table.', out: 'Original columns plus the date results.' },
        options: [
            { name: 'parse', desc: 'Text → DATE/TIMESTAMP using a format.' },
            { name: 'extract', desc: 'Pull a part (year, month, dow, hour…).' },
            { name: 'truncate', desc: 'Floor to a unit (month, week, day…).' },
            { name: 'format', desc: 'Date → formatted text.' },
            { name: 'add', desc: 'Add/subtract an amount of a unit.' },
            { name: 'diff', desc: 'Difference between two date columns in a unit.' },
            { name: 'age', desc: 'Age/interval from a date to now.' },
        ],
        examples: ['Truncate order_date to month for a monthly trend.', 'diff(ship_date, order_date) in days.'],
        tips: ['Set the alias equal to the source column to overwrite it in place.'],
    },
    flatten: {
        summary: 'Unpack JSON/nested data — fields to columns, or arrays to rows.',
        whatItDoes: 'Two modes: "fields" extracts JSON paths into columns; "explode" turns an array column into one row per element.',
        io: { in: '1 upstream table.', out: 'fields → extra columns; explode → more rows.' },
        options: [
            { name: 'Mode', desc: 'fields (extract paths) or explode (array → rows).' },
            { name: 'Column', desc: 'The JSON/array source column.' },
            { name: 'Paths', desc: 'For fields mode: each JSON path + output alias.' },
        ],
        examples: ['Extract payload.user.id into its own column.', 'Explode an items[] array into one row per item.'],
        tips: ['Explode multiplies rows — combine with a filter to keep it manageable.'],
    },

    // ── Reshape & Aggregate ──────────────────────────────────────
    group_aggregate: {
        summary: 'Summarize rows into groups with SUM, COUNT, AVG and more.',
        whatItDoes: 'Groups by chosen columns and computes aggregates per group, with an optional HAVING filter on the results.',
        io: { in: '1 upstream table.', out: 'One row per group with the aggregates.' },
        options: [
            { name: 'Group Columns', desc: 'Columns to group by (empty = whole-table aggregate).' },
            { name: 'Aggregations', desc: 'func(column) AS alias. Supports COUNT(*), COUNT DISTINCT, PERCENTILE, MEDIAN, STDDEV, STRING_AGG, LIST…' },
            { name: 'Having', desc: 'Optional filter on the aggregated result.' },
        ],
        examples: ['Revenue by region: SUM(amount) GROUP BY region.', 'Keep groups with COUNT(*) > 10 via HAVING.'],
        tips: ['Use COUNT DISTINCT for unique counts; PERCENTILE for medians/quantiles.'],
    },
    window_functions: {
        summary: 'Running totals, rankings, lags — without collapsing rows.',
        whatItDoes: 'Computes window functions (ROW_NUMBER, RANK, LAG, SUM OVER…) partitioned and ordered as you specify, keeping every row.',
        io: { in: '1 upstream table.', out: 'Original rows plus the window columns.' },
        options: [
            { name: 'Windows', desc: 'Each: function, optional column, alias, partition-by and order-by.' },
        ],
        examples: ['Rank sales within each region.', 'Month-over-month change with LAG.'],
        tips: ['Unlike Group & Aggregate, windows keep all rows — they add columns, not collapse them.'],
    },
    pivot: {
        summary: 'Turn row values into columns (long → wide).',
        whatItDoes: 'Spreads a category column across new columns, aggregating a value per group — like a spreadsheet pivot table.',
        io: { in: '1 upstream table.', out: 'One row per group, a column per category.' },
        options: [
            { name: 'Group Column', desc: 'Rows of the result.' },
            { name: 'Pivot Column', desc: 'Its distinct values become new columns.' },
            { name: 'Value Column', desc: 'What fills the cells.' },
            { name: 'Aggregate', desc: 'SUM/COUNT/AVG/MIN/MAX for each cell.' },
        ],
        examples: ['Months as columns, product as rows, SUM(sales) in cells.'],
        tips: ['The output shape depends on the data — run it to see the resulting columns.'],
    },
    unpivot: {
        summary: 'Turn columns into rows (wide → long).',
        whatItDoes: 'Melts several columns into name/value pairs — the inverse of pivot, and what most charts prefer.',
        io: { in: '1 upstream table.', out: 'More rows, fewer columns.' },
        options: [
            { name: 'Value Columns', desc: 'The columns to melt into rows.' },
            { name: 'Name Column', desc: 'Holds the original column name (default "variable").' },
            { name: 'Value Column', desc: 'Holds the value (default "value").' },
        ],
        examples: ['jan, feb, mar columns → a month column + a value column.'],
        tips: ['Long format is usually the right input for the Story Flow visualizer.'],
    },

    // ── Combine & Enrich ─────────────────────────────────────────
    join_tables: {
        summary: 'Join two tables on one or more key columns.',
        whatItDoes: 'Combines two upstream tables side by side. Supports LEFT/INNER/RIGHT/FULL and composite keys (multiple column pairs).',
        io: { in: 'Exactly 2 upstreams — 1st = left, 2nd = right.', out: 'Columns from both, matched on the keys.' },
        options: [
            { name: 'Join Type', desc: 'LEFT, INNER, RIGHT or FULL.' },
            { name: 'Keys', desc: 'One or more left = right column pairs (composite join).' },
        ],
        examples: ['orders LEFT JOIN customers ON customer_id.', 'Composite: ON a.region=b.region AND a.year=b.year.'],
        tips: ['Connect the left table first — order decides which side is which.'],
    },
    merge_tables: {
        summary: 'Stack two or more tables of the same shape (UNION).',
        whatItDoes: 'Appends rows from multiple upstreams into one table. UNION ALL keeps duplicates; UNION removes them.',
        io: { in: '2+ upstreams with matching columns.', out: 'All rows combined.' },
        options: [
            { name: 'Merge Mode', desc: 'union_all (keep duplicates) or union (remove duplicates).' },
            { name: 'Result Table Name', desc: 'Name of the combined table.' },
        ],
        examples: ['Combine this-year and last-year tables for a trend.'],
        tips: ['Use Import Folder instead if the inputs are many files in one directory.'],
    },
    ai_enrich: {
        summary: 'Apply an LLM to each row: classify, extract, summarize, redact PII.',
        whatItDoes: 'Runs the active AI model once per row over a text column and writes the result to a new column — the AI counterpart of a derived column.',
        io: { in: '1 upstream table.', out: 'Original columns plus the AI result column.' },
        options: [
            { name: 'Input Column', desc: 'The text column the model reads.' },
            { name: 'Task', desc: 'classify (with categories), extract, summarize, redact_pii, or custom (your instruction).' },
            { name: 'Output Column', desc: 'Where the result is written (default "ai_result").' },
            { name: 'Max Rows', desc: 'Cap on rows processed — one LLM call each.' },
        ],
        examples: ['Classify reviews as positive/neutral/negative.', 'Extract the company name from a free-text field.'],
        tips: ['One call per row — keep Max Rows modest on big tables.', 'Uses the provider/model set in Settings → AI.'],
    },

    // ── Output ───────────────────────────────────────────────────
    create_table: {
        summary: 'Persist the result as a named table in the database.',
        whatItDoes: 'Materializes the upstream output (or a manual query) as a permanent table you can query later or reuse in other chains.',
        io: { in: '1 upstream (or a manual query).', out: 'A persisted table.' },
        options: [
            { name: 'Table Name', desc: 'Name of the table to create/replace.' },
            { name: 'Query', desc: 'Optional — defaults to the upstream output.' },
        ],
        examples: ['Save the final model as analytics_summary.'],
        tips: ['Re-running replaces the table, so chains stay idempotent.'],
    },
    export_file: {
        summary: 'Write the result to a file — local or cloud, optionally partitioned.',
        whatItDoes: 'Exports the upstream output as CSV/Parquet/Excel/JSON to a local path or an S3/GCS bucket. Can write a partitioned directory.',
        io: { in: '1 upstream (or a manual query).', out: 'A file (or partitioned folder).' },
        options: [
            { name: 'Output Path', desc: 'Local path or s3:// / gs:// URI. Cloud uses Settings credentials.' },
            { name: 'Format', desc: 'csv, parquet, xlsx or json.' },
            { name: 'Partition By', desc: 'Optional columns — writes a partitioned directory (e.g. year=2025/…).' },
        ],
        examples: ['Export to s3://reports/out.parquet.', 'Partition by year, region for a data lake.'],
        tips: ['When Partition By is set, the path is treated as a directory, not a single file.'],
    },
    chart: {
        summary: 'Save the upstream data as a chart (.amoxvis).',
        whatItDoes: 'Writes a Story Flow chart config referencing the upstream query, so the pipeline itself produces something visual — not just a table someone has to go query. X/Y axes auto-pick from the query\'s columns when left blank.',
        io: { in: '1 upstream (or a manual query).', out: 'A .amoxvis file; passes the upstream data through unchanged for anything connected after it.' },
        options: [
            { name: 'Output Path', desc: 'Where the .amoxvis is written, e.g. charts/sales.amoxvis.' },
            { name: 'Chart Type / Axes / Title', desc: 'Same fields as Story Flow — leave axes blank to auto-pick.' },
        ],
        examples: ['End a cleaning pipeline with a chart of the result instead of a bare table.'],
        tips: ['Open the resulting .amoxvis in Story Flow any time to refine it by hand — re-running the pipeline overwrites it with the same query, not your manual edits.'],
    },
    report: {
        summary: 'Turn the upstream data into a notebook or a one-slide deck.',
        whatItDoes: 'Writes either a .sqlnb with one SQL cell, or a .amoxdeck with a title slide and one chart-full slide (which also writes the chart as its own .amoxvis) — so a scheduled pipeline can end in something ready to open and read, not a table someone has to remember to check.',
        io: { in: '1 upstream (or a manual query).', out: 'A .sqlnb or .amoxdeck file (+ a .amoxvis alongside it in deck mode); passes the upstream data through unchanged.' },
        options: [
            { name: 'Output Type', desc: 'notebook (.sqlnb) or deck (.amoxdeck).' },
            { name: 'Title', desc: 'Heading text — used as the notebook\'s title or the deck\'s title slide.' },
            { name: 'Chart Type / Axes / Title', desc: 'Deck mode only — same fields as the Chart node.' },
            { name: 'Output Path', desc: 'Where the file is written.' },
        ],
        examples: ['End a weekly pipeline with reports/weekly_sales.amoxdeck instead of a table nobody opens.'],
        tips: ['Notebook mode writes the query unexecuted — open it and Run All when you want fresh numbers.'],
    },

    // ── Quality & Control ────────────────────────────────────────
    assert: {
        summary: 'Stop the run if a data-quality check fails.',
        whatItDoes: 'A guard rail: validates a condition (not empty, row count, no nulls, uniqueness, or a custom query) and fails the chain when it is not met.',
        io: { in: '1 upstream (or a named table).', out: 'Passes data through unchanged when the check holds.' },
        options: [
            { name: 'Assert Type', desc: 'not_empty, row_count_gt, no_nulls, unique, or custom_query.' },
            { name: 'Column / Threshold / Query', desc: 'Extra inputs depending on the chosen check.' },
        ],
        examples: ['Fail if the final table is empty.', 'Fail if customer_id has nulls.'],
        tips: ['Place asserts right before Output nodes to catch bad data before it ships.'],
    },
    schema_validation: {
        summary: 'Verify the data has the expected columns and types.',
        whatItDoes: 'Checks the upstream schema against a list of expected columns/types — strict mode also rejects unexpected extras.',
        io: { in: '1 upstream table.', out: 'Passes data through when the schema matches.' },
        options: [
            { name: 'Expected Columns', desc: 'Each: name + type.' },
            { name: 'Strict', desc: 'If on, extra columns also fail the check.' },
        ],
        examples: ['Ensure id:INTEGER, name:VARCHAR exist before exporting.'],
        tips: ['Great as a contract when an upstream source might change shape.'],
    },
    checkpoint: {
        summary: 'Pause the run here so you can resume later.',
        whatItDoes: 'Halts execution at this node. You can inspect results and then Resume to continue from this point.',
        io: { in: '1 upstream.', out: 'Passes data through on resume.' },
        options: [
            { name: 'Resume Label', desc: 'A note shown at the pause, e.g. "Wait for team review".' },
        ],
        examples: ['Pause before an expensive step pending approval.'],
        tips: ['Materialized results upstream are reused on resume — no full re-run.'],
    },
    notification: {
        summary: 'Send a message: toast, log file, or webhook.',
        whatItDoes: 'Emits a notification when the run reaches this node — useful to signal completion or post to an external system.',
        io: { in: '1 upstream (optional).', out: 'Passes data through unchanged.' },
        options: [
            { name: 'Type', desc: 'toast (in-app), log_file (append to a file), or webhook (HTTP POST).' },
            { name: 'Message', desc: 'The text to send.' },
            { name: 'Webhook URL / Log Path', desc: 'Destination, depending on type.' },
        ],
        examples: ['Toast "Pipeline finished" at the end of a chain.'],
        tips: ['Webhook posts a JSON body — point it at a chat or automation endpoint.'],
    },
};

/** Get docs for a node type, or null if undocumented. */
export function getNodeDocs(typeId) {
    return NODE_DOCS[typeId] || null;
}
