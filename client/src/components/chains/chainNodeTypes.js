/**
 * Chain Node Type Registry
 * Defines all available node types with their metadata, icons, and colors.
 */
import {
    LuFileCode2, LuCode, LuFileInput, LuFolderInput,
    LuFileOutput, LuPause
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
};

export const NODE_TYPE_LIST = Object.values(NODE_TYPES);

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
    unknown: 'Executed',
};
