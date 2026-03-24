export const CELL_MARKER_CODE = '-- !CELL:CODE!';
export const CELL_MARKER_MARKDOWN = '-- !CELL:MARKDOWN!';

const MAX_CACHED_ROWS = 500;

/**
 * Parses raw file content into an array of structured blocks (cells).
 * Handles v3.0 (with embedded state), v2.0, and legacy line-based format.
 * Returns { cells, environment, version }
 */
export const parseNotebookContent = (content) => {
    if (!content || !content.trim()) {
        return [{ id: Date.now().toString(), type: 'code', content: '' }];
    }

    // Try parsing as JSON first (v2.0 / v3.0)
    try {
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.cells)) {
            return parsed.cells.map(cell => ({
                ...cell,
                id: cell.id?.toString() || Date.now().toString() + Math.random().toString()
            }));
        }
    } catch (e) {
        // Not JSON, fall back to legacy format parsing
    }

    // Legacy Format Parsing
    const lines = content.split('\n');
    const parsedCells = [];
    let currentCell = { id: Date.now().toString(), type: 'code', content: [] };

    if (!content.includes(CELL_MARKER_CODE) && !content.includes(CELL_MARKER_MARKDOWN)) {
        return [{ id: Date.now().toString(), type: 'code', content: content }];
    }

    let isFirst = true;

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed === CELL_MARKER_CODE) {
            if (!isFirst) {
                currentCell.content = currentCell.content.join('\n');
                parsedCells.push(currentCell);
            }
            currentCell = { id: (Date.now() + Math.random()).toString(), type: 'code', content: [] };
            isFirst = false;
        } else if (trimmed === CELL_MARKER_MARKDOWN) {
            if (!isFirst) {
                currentCell.content = currentCell.content.join('\n');
                parsedCells.push(currentCell);
            }
            currentCell = { id: (Date.now() + Math.random()).toString(), type: 'markdown', content: [] };
            isFirst = false;
        } else {
            let lineContent = line;
            if (currentCell.type === 'markdown') {
                if (line.trim().startsWith('-- ')) {
                    lineContent = line.trim().substring(3);
                } else if (line.trim().startsWith('--')) {
                    lineContent = line.trim().substring(2);
                }
            }
            currentCell.content.push(lineContent);
        }
    });

    currentCell.content = currentCell.content.join('\n');
    parsedCells.push(currentCell);

    return parsedCells;
};

/**
 * Extracts environment from raw notebook content.
 */
export const parseNotebookEnvironment = (content) => {
    try {
        const parsed = JSON.parse(content);
        return parsed?.environment || {};
    } catch (e) {
        return {};
    }
};

/**
 * Extracts the version string from raw notebook content.
 */
export const parseNotebookVersion = (content) => {
    try {
        const parsed = JSON.parse(content);
        return parsed?.version || null;
    } catch (e) {
        return null;
    }
};

/**
 * Serializes the cells array into v3.0 JSON format with embedded state.
 * Truncates cached results to MAX_CACHED_ROWS to control file size.
 */
export const serializeNotebookContent = (cells, environment = {}) => {
    const serializedCells = cells.map(cell => {
        const { state, ...cellData } = cell;

        // Only include state if it has meaningful data
        if (!state) return cellData;

        const cleanState = {};

        // Persist chart config
        if (state.chartConfig) cleanState.chartConfig = state.chartConfig;
        // Persist view mode
        if (state.viewMode) cleanState.viewMode = state.viewMode;
        // Persist result height
        if (state.resultHeight && state.resultHeight !== 400) cleanState.resultHeight = state.resultHeight;

        // Persist cached result (truncated)
        if (state.result && state.result.data && !state.result.loading && !state.result.error) {
            const data = state.result.data;
            cleanState.result = {
                data: data.length > MAX_CACHED_ROWS ? data.slice(0, MAX_CACHED_ROWS) : data,
                executionTime: state.result.executionTime,
                totalRows: state.result.totalRows || data.length,
                truncated: data.length > MAX_CACHED_ROWS
            };
        }

        if (Object.keys(cleanState).length === 0) return cellData;

        return { ...cellData, state: cleanState };
    });

    const structure = {
        version: "3.0",
        cells: serializedCells,
        environment: environment
    };

    return JSON.stringify(structure, null, 2);
};
