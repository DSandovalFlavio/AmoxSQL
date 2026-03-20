export const CELL_MARKER_CODE = '-- !CELL:CODE!';
export const CELL_MARKER_MARKDOWN = '-- !CELL:MARKDOWN!';

/**
 * Parses raw file content into an array of structured blocks (cells).
 * Handles both the legacy line-based format and the new proposed JSON format.
 */
export const parseNotebookContent = (content) => {
    if (!content || !content.trim()) {
        return [{ id: Date.now().toString(), type: 'code', content: '' }];
    }

    // Try parsing as JSON first (New Format)
    try {
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.cells)) {
            // Ensure all cells have string IDs
            return parsed.cells.map(cell => ({ ...cell, id: cell.id?.toString() || Date.now().toString() + Math.random().toString() }));
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
 * Serializes the blocks array into the new required JSON format.
 */
export const serializeNotebookContent = (cells) => {
    const defaultStructure = {
        version: "2.0",
        cells: cells,
        environment: {}
    };
    // Use format with 2 spaces for readability, similar to deepnote format
    return JSON.stringify(defaultStructure, null, 2);
};
