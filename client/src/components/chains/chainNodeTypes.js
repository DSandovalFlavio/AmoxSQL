/**
 * Chain Node Type Registry
 * Defines all available node types with their metadata, icons, and colors.
 */
import {
    LuFileCode2, LuCode, LuFileInput, LuFolderInput,
    LuFileOutput, LuPause, LuTable2, LuMerge, LuShieldCheck,
    LuFilter, LuGroup, LuColumns3, LuCopyMinus, LuCalculator,
    LuArrowUpDown, LuDices, LuFlipHorizontal2, LuPencilLine, LuShuffle,
    LuTableProperties
} from 'react-icons/lu';

export const NODE_TYPES = {
    sql_file: {
        id: 'sql_file',
        label: 'SQL File',
        description: 'Execute a .sql file from the project',
        icon: LuFileCode2,
        color: {
            bg: 'oklch(0.22 0.04 250)',
            border: 'oklch(0.35 0.08 250)',
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
            bg: 'oklch(0.22 0.04 270)',
            border: 'oklch(0.35 0.08 270)',
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
            bg: 'oklch(0.22 0.04 155)',
            border: 'oklch(0.35 0.08 155)',
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
            bg: 'oklch(0.22 0.04 140)',
            border: 'oklch(0.35 0.08 140)',
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
            bg: 'oklch(0.22 0.04 50)',
            border: 'oklch(0.35 0.08 50)',
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
            bg: 'oklch(0.22 0.04 190)',
            border: 'oklch(0.35 0.08 190)',
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
            bg: 'oklch(0.22 0.04 85)',
            border: 'oklch(0.35 0.08 85)',
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
            bg: 'oklch(0.22 0.04 200)',
            border: 'oklch(0.35 0.08 200)',
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
            bg: 'oklch(0.22 0.04 310)',
            border: 'oklch(0.35 0.08 310)',
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
            bg: 'oklch(0.22 0.04 120)',
            border: 'oklch(0.35 0.08 120)',
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
            bg: 'oklch(0.22 0.04 330)',
            border: 'oklch(0.35 0.08 330)',
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
            bg: 'oklch(0.22 0.04 35)',
            border: 'oklch(0.35 0.08 35)',
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
            bg: 'oklch(0.22 0.04 290)',
            border: 'oklch(0.35 0.08 290)',
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
            bg: 'oklch(0.22 0.04 180)',
            border: 'oklch(0.35 0.08 180)',
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
            bg: 'oklch(0.22 0.04 60)',
            border: 'oklch(0.35 0.08 60)',
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
            bg: 'oklch(0.22 0.04 220)',
            border: 'oklch(0.35 0.08 220)',
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
            bg: 'oklch(0.22 0.04 170)',
            border: 'oklch(0.35 0.08 170)',
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
            bg: 'oklch(0.22 0.04 100)',
            border: 'oklch(0.35 0.08 100)',
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
            bg: 'oklch(0.22 0.04 5)',
            border: 'oklch(0.35 0.08 5)',
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
            bg: 'oklch(0.22 0.04 240)',
            border: 'oklch(0.35 0.08 240)',
            accent: 'oklch(0.65 0.15 240)',
        },
        defaultConfig: { newName: '' },
    },
};

export const NODE_TYPE_LIST = Object.values(NODE_TYPES);

/**
 * Node categories for grouping in the palette
 */
export const NODE_CATEGORIES = [
    {
        id: 'sources',
        label: 'Data Sources',
        types: ['import_file', 'import_folder', 'table_ref'],
    },
    {
        id: 'sql',
        label: 'SQL',
        types: ['sql_file', 'sql_inline'],
    },
    {
        id: 'transform',
        label: 'Transform',
        types: ['filter', 'select_columns', 'add_column', 'group_aggregate', 'join_tables', 'sort', 'deduplicate', 'pivot', 'sample', 'rename_table'],
    },
    {
        id: 'combine',
        label: 'Combine',
        types: ['merge_tables'],
    },
    {
        id: 'output',
        label: 'Output',
        types: ['export_file', 'create_table'],
    },
    {
        id: 'control',
        label: 'Control Flow',
        types: ['checkpoint', 'assert'],
    },
];

/**
 * Status colors for node execution states
 */
export const STATUS_COLORS = {
    pending: { bg: 'transparent', border: 'var(--border-default)', text: 'var(--text-tertiary)' },
    running: { bg: 'oklch(0.25 0.06 250 / 0.3)', border: 'oklch(0.6 0.15 250)', text: 'oklch(0.8 0.1 250)' },
    success: { bg: 'oklch(0.25 0.06 155 / 0.3)', border: 'oklch(0.6 0.15 155)', text: 'oklch(0.8 0.1 155)' },
    failed: { bg: 'oklch(0.25 0.06 25 / 0.3)', border: 'oklch(0.6 0.15 25)', text: 'oklch(0.8 0.1 25)' },
    skipped: { bg: 'oklch(0.2 0 0 / 0.3)', border: 'oklch(0.4 0 0)', text: 'oklch(0.5 0 0)' },
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
