/**
 * Chain Node Type Registry
 * Defines all available node types with their metadata, icons, and colors.
 */
import {
    LuFileCode2, LuCode, LuFileInput, LuFolderInput,
    LuFileOutput, LuPause, LuTable2, LuMerge, LuShieldCheck,
    LuFilter, LuGroup, LuColumns3, LuCopyMinus, LuCalculator,
    LuArrowUpDown, LuDices, LuFlipHorizontal2, LuPencilLine, LuShuffle,
    LuTableProperties, LuArrowLeftRight, LuGalleryVerticalEnd, LuRows3,
    LuGlobe, LuWandSparkles, LuLayoutList, LuBell, LuRadar, LuCalendarClock, LuBraces,
    LuCloud, LuSheet, LuSparkles
} from 'react-icons/lu';

export const NODE_TYPES = {
    sql_file: {
        id: 'sql_file',
        label: 'SQL File',
        description: 'Execute a .sql file from the project',
        icon: LuFileCode2,
        color: {
            accent: 'oklch(0.65 0.15 250)',
        },
        defaultConfig: { filePath: '' },
    },
    sql_inline: {
        id: 'sql_inline',
        label: 'SQL Query',
        description: 'Write and execute SQL directly',
        icon: LuCode,
        color: {
            accent: 'oklch(0.65 0.15 270)',
        },
        defaultConfig: { query: '' },
    },
    import_file: {
        id: 'import_file',
        label: 'Import File',
        description: 'Import a CSV, Parquet, JSON, or Excel file into a table',
        icon: LuFileInput,
        color: {
            accent: 'oklch(0.65 0.15 155)',
        },
        defaultConfig: { sourcePath: '', tableName: '', fileType: 'csv', cleanColumns: true },
    },
    import_folder: {
        id: 'import_folder',
        label: 'Import Folder',
        description: 'Load all matching files from a folder into one table',
        icon: LuFolderInput,
        color: {
            accent: 'oklch(0.65 0.15 140)',
        },
        defaultConfig: { folderPath: '', filePattern: '*.csv', tableName: '' },
    },
    export_file: {
        id: 'export_file',
        label: 'Export File',
        description: 'Export query results to CSV, Parquet, or Excel',
        icon: LuFileOutput,
        color: {
            accent: 'oklch(0.65 0.15 50)',
        },
        defaultConfig: { query: '', format: 'csv', outputPath: '' },
    },
    create_table: {
        id: 'create_table',
        label: 'Create Table',
        description: 'Create a new table from upstream data or a custom query',
        icon: LuTableProperties,
        color: {
            accent: 'oklch(0.65 0.15 190)',
        },
        defaultConfig: { tableName: '', query: '' },
    },
    checkpoint: {
        id: 'checkpoint',
        label: 'Checkpoint',
        description: 'Pause execution here — useful for team handoffs',
        icon: LuPause,
        color: {
            accent: 'oklch(0.65 0.15 85)',
        },
        defaultConfig: { resumeLabel: '' },
    },
    table_ref: {
        id: 'table_ref',
        label: 'Table Source',
        description: 'Reference an existing table or view as a data source',
        icon: LuTable2,
        color: {
            accent: 'oklch(0.65 0.15 200)',
        },
        defaultConfig: { tableName: '' },
    },
    merge_tables: {
        id: 'merge_tables',
        label: 'Merge Tables',
        description: 'Combine data from multiple upstream nodes into one table',
        icon: LuMerge,
        color: {
            accent: 'oklch(0.65 0.15 310)',
        },
        defaultConfig: { tableName: 'merged_data', mergeMode: 'union_all' },
    },
    assert: {
        id: 'assert',
        label: 'Assert',
        description: 'Validate data quality — stops the chain if the check fails',
        icon: LuShieldCheck,
        color: {
            accent: 'oklch(0.65 0.15 120)',
        },
        defaultConfig: { assertType: 'not_empty', tableName: '', column: '', threshold: '0', query: '' },
    },
    join_tables: {
        id: 'join_tables',
        label: 'Join Tables',
        description: 'Combine two tables using a key column (LEFT, INNER, etc.)',
        icon: LuShuffle,
        color: {
            accent: 'oklch(0.65 0.15 330)',
        },
        defaultConfig: { tableName: 'joined_data', joinType: 'LEFT', leftKey: '', rightKey: '' },
    },
    filter: {
        id: 'filter',
        label: 'Filter',
        description: 'Keep only rows matching your conditions (no SQL needed)',
        icon: LuFilter,
        color: {
            accent: 'oklch(0.65 0.15 35)',
        },
        defaultConfig: { tableName: 'filtered_data', conditions: [], connector: 'AND' },
    },
    group_aggregate: {
        id: 'group_aggregate',
        label: 'Group & Aggregate',
        description: 'Summarize data with SUM, COUNT, AVG grouped by columns',
        icon: LuGroup,
        color: {
            accent: 'oklch(0.65 0.15 290)',
        },
        defaultConfig: { tableName: 'aggregated_data', groupColumns: [], aggregations: [] },
    },
    select_columns: {
        id: 'select_columns',
        label: 'Select Columns',
        description: 'Pick and rename columns to keep',
        icon: LuColumns3,
        color: {
            accent: 'oklch(0.65 0.15 180)',
        },
        defaultConfig: { tableName: 'selected_columns', columns: [] },
    },
    deduplicate: {
        id: 'deduplicate',
        label: 'Deduplicate',
        description: 'Remove duplicate rows based on key columns',
        icon: LuCopyMinus,
        color: {
            accent: 'oklch(0.65 0.15 60)',
        },
        defaultConfig: { tableName: 'deduplicated', keyColumns: [], keep: 'first' },
    },
    add_column: {
        id: 'add_column',
        label: 'Add Column',
        description: 'Create computed columns with expressions',
        icon: LuCalculator,
        color: {
            accent: 'oklch(0.65 0.15 220)',
        },
        defaultConfig: { tableName: 'with_column', newColumns: [] },
    },
    sort: {
        id: 'sort',
        label: 'Sort',
        description: 'Order rows by one or more columns',
        icon: LuArrowUpDown,
        color: {
            accent: 'oklch(0.65 0.15 170)',
        },
        defaultConfig: { tableName: 'sorted_data', sortColumns: [] },
    },
    sample: {
        id: 'sample',
        label: 'Sample',
        description: 'Take a subset of rows (first N or random %)',
        icon: LuDices,
        color: {
            accent: 'oklch(0.65 0.15 100)',
        },
        defaultConfig: { tableName: 'sample_data', sampleType: 'rows', sampleValue: '100' },
    },
    pivot: {
        id: 'pivot',
        label: 'Pivot',
        description: 'Transform rows into columns (pivot table)',
        icon: LuFlipHorizontal2,
        color: {
            accent: 'oklch(0.65 0.15 5)',
        },
        defaultConfig: { tableName: 'pivoted_data', groupColumn: '', pivotColumn: '', valueColumn: '', aggFunc: 'SUM' },
    },
    rename_table: {
        id: 'rename_table',
        label: 'Rename Table',
        description: 'Rename the upstream table to a new name',
        icon: LuPencilLine,
        color: {
            accent: 'oklch(0.65 0.15 240)',
        },
        defaultConfig: { newName: '' },
    },

    // --- New nodes ---

    type_cast: {
        id: 'type_cast',
        label: 'Type Cast',
        description: 'Cast columns to different data types (VARCHAR, INTEGER, DATE, etc.)',
        icon: LuArrowLeftRight,
        color: {
            accent: 'oklch(0.65 0.15 210)',
        },
        defaultConfig: { tableName: 'casted_data', casts: [] },
    },

    window_functions: {
        id: 'window_functions',
        label: 'Window Functions',
        description: 'Apply ROW_NUMBER, RANK, LAG, running totals over partitions',
        icon: LuGalleryVerticalEnd,
        color: {
            accent: 'oklch(0.65 0.15 280)',
        },
        defaultConfig: { tableName: 'with_window', windows: [] },
    },

    unpivot: {
        id: 'unpivot',
        label: 'Unpivot',
        description: 'Transform columns into rows (inverse of pivot)',
        icon: LuRows3,
        color: {
            accent: 'oklch(0.65 0.15 15)',
        },
        defaultConfig: { tableName: 'unpivoted_data', idColumns: [], valueColumns: [], nameColumn: 'variable', valueColumn: 'value' },
    },

    bucket_read: {
        id: 'bucket_read',
        label: 'Cloud Bucket',
        description: 'Read CSV/Parquet/JSON from an S3 or GCS bucket (credentials in Settings)',
        icon: LuCloud,
        color: {
            accent: 'oklch(0.65 0.15 230)',
        },
        defaultConfig: { uri: '', format: 'parquet', tableName: 'cloud_data', provider: 's3' },
    },

    gsheet_read: {
        id: 'gsheet_read',
        label: 'Google Sheet',
        description: 'Read a Google Sheet tab into a table (service account in Settings)',
        icon: LuSheet,
        color: {
            accent: 'oklch(0.65 0.15 150)',
        },
        defaultConfig: { spreadsheetId: '', sheet: '', tableName: 'gsheet_data' },
    },

    ai_enrich: {
        id: 'ai_enrich',
        label: 'AI Enrich',
        description: 'Apply an LLM per row: classify, extract, summarize, or redact PII',
        icon: LuSparkles,
        color: {
            accent: 'oklch(0.65 0.18 300)',
        },
        defaultConfig: { tableName: 'enriched_data', inputColumn: '', outputColumn: 'ai_result', task: 'classify', maxRows: 500, options: {} },
    },

    http_fetch: {
        id: 'http_fetch',
        label: 'HTTP Fetch',
        description: 'Load data from a URL (CSV, JSON, Parquet)',
        icon: LuGlobe,
        color: {
            accent: 'oklch(0.65 0.15 145)',
        },
        defaultConfig: { url: '', tableName: 'fetched_data', format: 'csv' },
    },

    clean: {
        id: 'clean',
        label: 'Clean / Replace',
        description: 'Apply cleaning ops: trim, lower/upper, replace, fill nulls',
        icon: LuWandSparkles,
        color: {
            accent: 'oklch(0.65 0.15 70)',
        },
        defaultConfig: { tableName: 'cleaned_data', operations: [] },
    },

    date_ops: {
        id: 'date_ops',
        label: 'Date / Time',
        description: 'Parse text→date, extract parts, truncate, format, and compute with dates',
        icon: LuCalendarClock,
        color: {
            accent: 'oklch(0.65 0.15 45)',
        },
        defaultConfig: { tableName: 'dated_data', operations: [] },
    },

    flatten: {
        id: 'flatten',
        label: 'Flatten / Unnest',
        description: 'Extract nested JSON fields to columns, or explode an array into rows',
        icon: LuBraces,
        color: {
            accent: 'oklch(0.65 0.15 25)',
        },
        defaultConfig: { tableName: 'flattened_data', mode: 'fields', column: '', paths: [], alias: '' },
    },

    schema_validation: {
        id: 'schema_validation',
        label: 'Schema Validation',
        description: 'Assert that upstream data has expected columns and types',
        icon: LuLayoutList,
        color: {
            accent: 'oklch(0.65 0.15 110)',
        },
        defaultConfig: { expectedColumns: [], strict: false },
    },

    notification: {
        id: 'notification',
        label: 'Notification',
        description: 'Send a notification or log entry when this step runs',
        icon: LuBell,
        color: {
            accent: 'oklch(0.65 0.15 80)',
        },
        defaultConfig: { notifType: 'toast', message: '', logFilePath: '', webhookUrl: '' },
    },
};

export const NODE_TYPE_LIST = Object.values(NODE_TYPES);

/**
 * Node categories for grouping in the palette
 */
// Intent-based grouping, ordered like a pipeline (top → bottom mirrors a DAG
// left → right): ingest → SQL → rows → columns → clean → reshape/aggregate →
// combine/enrich → output → quality. Keeps every group small and scannable.
export const NODE_CATEGORIES = [
    {
        id: 'sources',
        label: 'Data Sources',
        types: ['import_file', 'import_folder', 'table_ref', 'http_fetch', 'bucket_read', 'gsheet_read'],
    },
    {
        id: 'sql',
        label: 'SQL',
        types: ['sql_inline', 'sql_file'],
    },
    {
        id: 'filter_order',
        label: 'Filter & Order',
        types: ['filter', 'deduplicate', 'sample', 'sort'],
    },
    {
        id: 'columns',
        label: 'Columns',
        types: ['select_columns', 'add_column', 'rename_table', 'type_cast'],
    },
    {
        id: 'clean_format',
        label: 'Clean & Format',
        types: ['clean', 'date_ops', 'flatten'],
    },
    {
        id: 'reshape_aggregate',
        label: 'Reshape & Aggregate',
        types: ['group_aggregate', 'window_functions', 'pivot', 'unpivot'],
    },
    {
        id: 'combine_enrich',
        label: 'Combine & Enrich',
        types: ['join_tables', 'merge_tables', 'ai_enrich'],
    },
    {
        id: 'output',
        label: 'Output',
        types: ['create_table', 'export_file'],
    },
    {
        id: 'quality_control',
        label: 'Quality & Control',
        types: ['assert', 'schema_validation', 'checkpoint', 'notification'],
    },
];

/**
 * Status colors for node execution states
 */
export const STATUS_COLORS = {
    pending: { bg: 'transparent', border: 'var(--border-default)', text: 'var(--text-tertiary)' },
    running: { bg: 'var(--color-info-bg)', border: 'var(--color-info)', text: 'var(--color-info-text)' },
    success: { bg: 'var(--color-success-bg)', border: 'var(--color-success)', text: 'var(--color-success-text)' },
    failed: { bg: 'var(--color-error-bg)', border: 'var(--color-error)', text: 'var(--color-error-text)' },
    skipped: { bg: 'transparent', border: 'var(--border-default)', text: 'var(--text-tertiary)' },
};

export const RESULT_TYPE_LABELS = {
    table_created: 'Table Created',
    view_created: 'View Created',
    rows_inserted: 'Rows Inserted',
    rows_updated: 'Rows Updated',
    rows_deleted: 'Rows Deleted',
    file_exported: 'File Exported',
    query_result: 'Query Result',
    table_dropped: 'Table Dropped',
    view_dropped: 'View Dropped',
    checkpoint_reached: 'Checkpoint',
    table_referenced: 'Table Referenced',
    assertion_passed: 'Assertion Passed',
    unknown: 'Executed',
};

export const NODE_TYPE_COLORS = {
    sources: 'oklch(0.65 0.15 155)',
    sql: 'oklch(0.65 0.15 260)',
    transform: 'oklch(0.65 0.15 210)',
    combine: 'oklch(0.65 0.15 310)',
    output: 'oklch(0.65 0.15 50)',
    control: 'oklch(0.65 0.15 120)',
};
