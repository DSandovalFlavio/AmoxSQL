/**
 * chainGenerator — turns a natural-language description into a Chains DAG.
 *
 * Produces a structured { name, nodes, edges, variables } object (a .sqlchain
 * definition) from a prompt, the current chain (for edits), available data, and
 * the data-engineering skills. Uses generateText + strict JSON extraction +
 * Zod validation with a single repair retry — works across all providers,
 * including small local models that don't support native structured output.
 *
 * Positions and edge ids are left to the frontend (auto-layout on apply).
 */
const { generateText } = require('ai');
const { z } = require('zod');

// Node types the generator may emit, with their config keys. Mirrors the
// frontend NODE_TYPES registry + the server executor. Keep in sync when nodes
// change (single prose contract handed to the model).
const NODE_CONTRACT = `
SOURCES
- import_file      config: { sourcePath, tableName, fileType: csv|tsv|parquet|json|xlsx }
- import_folder    config: { folderPath, filePattern (e.g. "*.csv"), tableName }
- http_fetch       config: { url, tableName, format: csv|parquet|json }
- bucket_read      config: { uri (s3://… or gs://…), tableName, format: csv|parquet|json, provider: s3|gcs }   // cloud object storage; creds in Settings
- gsheet_read      config: { spreadsheetId, sheet (tab name), tableName }   // Google Sheet; service account in Settings
- table_ref        config: { tableName }   // reference an existing table/view
SQL
- sql_inline       config: { query }        // raw DuckDB SQL
- sql_file         config: { filePath }      // path to a .sql file in the project
TRANSFORM (single upstream unless noted)
- filter           config: { tableName, connector: AND|OR, conditions: [{ column, operator: =|!=|>|>=|<|<=|LIKE|IN|IS NULL|IS NOT NULL, value }] }
- select_columns   config: { tableName, columns: [{ name, alias? }] }
- add_column       config: { tableName, newColumns: [{ name, expression }] }
- group_aggregate  config: { tableName, groupColumns: [string], aggregations: [{ func: SUM|COUNT|AVG|MIN|MAX, column, alias }] }
- join_tables      config: { tableName, joinType: LEFT|INNER|RIGHT|FULL, keys: [{ left, right }] }   // connect EXACTLY 2 upstreams (1st=left, 2nd=right); keys = composite join columns
- merge_tables     config: { tableName, mergeMode: union_all|union }   // connect 2+ upstreams of the same shape
- sort             config: { tableName, sortColumns: [{ column, direction: ASC|DESC }] }
- deduplicate      config: { tableName, keyColumns: [string], keep: first|last }
- type_cast        config: { tableName, casts: [{ column, targetType, alias? }] }
- window_functions config: { tableName, windows: [{ func: ROW_NUMBER|RANK|LAG|..., column?, alias, partitionBy: [string], orderBy: [string] }] }
- pivot            config: { tableName, groupColumn, pivotColumn, valueColumn, aggFunc: SUM|COUNT|AVG|MIN|MAX }
- unpivot          config: { tableName, valueColumns: [string], nameColumn, valueColumn }
- clean            config: { tableName, operations: [{ column, type: trim|lower|upper|replace|regex_replace|fill_null|nullify_empty, ... }] }
- date_ops         config: { tableName, operations: [{ column, op: parse|extract|truncate|format|add|diff|age, alias?, format?, part?, unit?, amount?, column2? }] }  // dates: text→date, extract part, truncate, format, add/subtract, diff
- flatten          config: { tableName, mode: fields|explode, column, paths?: [{ path, alias }], alias? }  // JSON: fields→columns or explode array→rows
- ai_enrich        config: { tableName, inputColumn, outputColumn, task: classify|extract|summarize|redact_pii|custom, maxRows, options: { categories?, instruction? } }  // LLM per row
- sample           config: { tableName, sampleType: rows|percent, sampleValue }
- rename_table     config: { newName }
OUTPUT
- create_table     config: { tableName, query? }
- export_file      config: { outputPath (local path OR s3://… / gs://…), format: csv|parquet|xlsx|json, partitionBy?: [string], query? }   // query optional; partitionBy writes a partitioned directory
CONTROL
- assert            config: { assertType: not_empty|row_count_gt|no_nulls|unique|custom_query, column?, threshold?, query? }
- schema_validation config: { expectedColumns: [{ name, type }], strict }
- checkpoint        config: { resumeLabel }
- notification      config: { notifType: toast|log_file|webhook, message, ... }
`.trim();

const NODE_TYPES = [
    'import_file', 'import_folder', 'http_fetch', 'bucket_read', 'gsheet_read', 'table_ref', 'sql_inline', 'sql_file',
    'filter', 'select_columns', 'add_column', 'group_aggregate', 'join_tables', 'merge_tables',
    'sort', 'deduplicate', 'type_cast', 'window_functions', 'pivot', 'unpivot', 'clean', 'date_ops', 'flatten', 'ai_enrich',
    'sample', 'rename_table', 'create_table', 'export_file', 'assert', 'schema_validation',
    'checkpoint', 'notification',
];

const chainSchema = z.object({
    name: z.string().optional(),
    nodes: z.array(z.object({
        id: z.string(),
        type: z.string(),
        label: z.string().optional(),
        config: z.record(z.any()).optional(),
    })).min(1),
    edges: z.array(z.object({
        source: z.string(),
        target: z.string(),
    })).optional(),
    variables: z.record(z.any()).optional(),
});

/** Extract the first balanced JSON object from model text (handles ```json fences and prose). */
function extractJson(text) {
    if (!text) return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try { return JSON.parse(candidate.slice(start, end + 1)); }
    catch { return null; }
}

function buildSystemPrompt({ tables, skillsText, currentChain }) {
    const tableList = (tables || []).length
        ? (tables || []).map(t => {
            const cols = (t.columns || []).map(c => `${c.name || c.column_name}:${c.type || c.data_type}`).join(', ');
            return `- ${t.name}${cols ? ` (${cols})` : ''}`;
        }).join('\n')
        : '(none loaded yet)';

    const editingBlock = currentChain && (currentChain.nodes || []).length
        ? `\nThe user is EDITING an existing chain. Current definition (modify/extend it, keep node ids stable where possible):\n${JSON.stringify({ nodes: currentChain.nodes, edges: currentChain.edges, variables: currentChain.variables }, null, 2)}\n`
        : '';

    return `You are a data-engineering assistant inside AmoxSQL's "Chains" visual pipeline builder.
Turn the user's request into a DAG of processing nodes that runs on local DuckDB.

OUTPUT RULES (critical):
- Respond with ONE JSON object ONLY. No prose, no markdown outside the JSON.
- Shape: { "name": string, "nodes": [ { "id": string, "type": string, "label": string, "config": object } ], "edges": [ { "source": nodeId, "target": nodeId } ], "variables": { } }
- "id" must be a short unique slug per node (e.g. "import_sales", "filter_2025"). Edges reference these ids.
- Every node's "type" MUST be one of the documented types. Fill "config" per that type's keys.
- Build a connected pipeline: sources → transforms → sink. Order matters; edges define data flow.
- For join_tables connect exactly two upstreams; for merge_tables connect two or more.
- Use a clear, human "label" per node describing what it does.
- Use \${var} placeholders + a "variables" map for reusable paths/thresholds when sensible.
- Do not invent node types or config keys. If unsure, prefer a sql_inline node with explicit SQL.

AVAILABLE NODE TYPES AND CONFIG:
${NODE_CONTRACT}

AVAILABLE TABLES:
${tableList}
${editingBlock}
${skillsText ? `\nDATA-ENGINEERING GUIDANCE (apply these patterns):\n${skillsText}\n` : ''}`;
}

/** Drop a derived intermediate's noisy default tableName so it doesn't leak; keep user-meaningful ones. */
function normalizeChain(parsed) {
    // Ensure unique node ids (the model can repeat them) and remap edges accordingly.
    const used = new Set();
    const remap = new Map(); // original id -> assigned unique id (first occurrence wins)
    const nodes = (parsed.nodes || []).map((n, i) => {
        let id = n.id || `n${i + 1}`;
        if (used.has(id)) { let k = 2; while (used.has(`${id}_${k}`)) k++; id = `${id}_${k}`; }
        used.add(id);
        if (n.id && !remap.has(n.id)) remap.set(n.id, id);
        return { id, type: n.type, label: n.label || n.type, config: n.config || {} };
    });
    const idSet = new Set(nodes.map(n => n.id));
    const edges = (parsed.edges || [])
        .map(e => ({ source: remap.get(e.source) || e.source, target: remap.get(e.target) || e.target }))
        .filter(e => idSet.has(e.source) && idSet.has(e.target))
        .map((e, i) => ({ id: `e${i + 1}`, source: e.source, target: e.target }));
    return {
        name: parsed.name || 'AI Generated Chain',
        nodes,
        edges,
        variables: parsed.variables || {},
    };
}

/**
 * Generate a chain definition from a prompt.
 * @returns {Promise<{ chain: object }>}
 * @param {object} opts
 * @param {function} opts.getModel  - (provider, model) => AI SDK model
 * @param {string}   opts.provider
 * @param {string}   opts.model
 * @param {string}   opts.prompt    - user request
 * @param {object}   [opts.currentChain] - existing chain to edit
 * @param {Array}    [opts.tables]   - available tables [{ name, columns }]
 * @param {string}   [opts.skillsText] - concatenated engineering skills
 * @param {function} [opts.validateGraph] - optional (chain) => true|string (error) to reject invalid DAGs
 */
async function generateChain({ getModel, provider, model, prompt, currentChain, tables, skillsText, validateGraph }) {
    const llm = getModel(provider, model);
    const system = buildSystemPrompt({ tables, skillsText, currentChain });

    let messages = [{ role: 'user', content: prompt }];

    for (let attempt = 0; attempt <= 1; attempt++) {
        const res = await generateText({ model: llm, system, messages, maxTokens: 4000 });
        const json = extractJson(res.text);
        let problem = null;

        if (!json) {
            problem = 'Output was not valid JSON. Return ONLY the JSON object.';
        } else {
            const parsed = chainSchema.safeParse(json);
            if (!parsed.success) {
                problem = `JSON did not match the required shape: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
            } else {
                const badType = parsed.data.nodes.find(n => !NODE_TYPES.includes(n.type));
                if (badType) {
                    problem = `Unknown node type "${badType.type}". Use only the documented types.`;
                } else {
                    const chain = normalizeChain(parsed.data);
                    const graphErr = validateGraph ? validateGraph(chain) : null;
                    if (graphErr && graphErr !== true) {
                        problem = `Invalid graph: ${graphErr}`;
                    } else {
                        return { chain };
                    }
                }
            }
        }

        // Repair: feed the problem back once.
        messages = [
            ...messages,
            { role: 'assistant', content: res.text },
            { role: 'user', content: `${problem}\nReturn ONLY a corrected JSON object, nothing else.` },
        ];
    }

    throw new Error('The model did not return a valid chain. Try rephrasing the request or a stronger model.');
}

module.exports = { generateChain };
