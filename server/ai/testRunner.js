/**
 * AmoxSQL AI — Agent Test Runner
 *
 * Executes YAML-defined test cases against the AI agent to validate
 * that it generates correct SQL and produces expected results.
 *
 * Test files live in: <project>/agent/tests/*.yaml
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Load all test definitions from the project's agent/tests/ directory.
 * @param {string} projectPath
 * @returns {Promise<Array<object>>}
 */
async function loadTests(projectPath) {
    if (!projectPath) return [];

    const testsDir = path.join(projectPath, 'agent', 'tests');
    try {
        if (!fs.existsSync(testsDir)) return [];

        const files = await fs.promises.readdir(testsDir);
        const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

        const tests = [];
        for (const fileName of yamlFiles) {
            try {
                const raw = await fs.promises.readFile(path.join(testsDir, fileName), 'utf8');
                const parsed = yaml.load(raw);
                if (!parsed || !parsed.prompt) continue;

                tests.push({
                    id: fileName.replace(/\.(yaml|yml)$/, ''),
                    fileName,
                    name: parsed.name || fileName,
                    prompt: parsed.prompt,
                    expected_sql_contains: parsed.expected_sql_contains || [],
                    expected_columns: parsed.expected_columns || [],
                    expected_min_rows: parsed.expected_min_rows || null,
                    max_execution_time: parsed.max_execution_time || 30000,
                });
            } catch (err) {
                console.warn(`[AI Tests] Error parsing ${fileName}:`, err.message);
            }
        }
        return tests;
    } catch (err) {
        console.warn('[AI Tests] Error loading tests:', err.message);
        return [];
    }
}

/**
 * Run a single test case.
 * @param {object} test - The test definition
 * @param {object} aiManager - The AiManager instance
 * @param {object} dbManager - The DatabaseManager instance
 * @returns {Promise<object>} Test result with pass/fail, generated SQL, timing
 */
async function runTest(test, aiManager, dbManager) {
    const startTime = performance.now();

    try {
        const result = await aiManager.chat({
            messages: [{ role: 'user', content: test.prompt }],
            dbManager,
            mode: 'diving',
            tables: [],
        });

        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);

        // Extract SQL queries from tool calls
        const sqlCalls = (result.toolResults || [])
            .filter(tr => tr.toolName === 'execute_sql')
            .map(tr => ({
                query: tr.args?.query || '',
                result: tr.result,
            }));

        const allSql = sqlCalls.map(s => s.query).join('\n');
        const lastResult = sqlCalls.length > 0 ? sqlCalls[sqlCalls.length - 1].result : null;

        // Validate expected_sql_contains
        const sqlChecks = (test.expected_sql_contains || []).map(pattern => ({
            pattern,
            found: allSql.toUpperCase().includes(pattern.toUpperCase()),
        }));
        const sqlPass = sqlChecks.every(c => c.found);

        // Validate expected_columns
        const resultColumns = lastResult?.columns?.map(c => c.name.toLowerCase()) || [];
        const columnChecks = (test.expected_columns || []).map(col => ({
            column: col,
            found: resultColumns.includes(col.toLowerCase()),
        }));
        const columnsPass = columnChecks.length === 0 || columnChecks.every(c => c.found);

        // Validate min rows
        const rowCount = lastResult?.rowCount || 0;
        const rowsPass = !test.expected_min_rows || rowCount >= test.expected_min_rows;

        // Validate execution time
        const timePass = duration <= test.max_execution_time;

        const pass = sqlPass && columnsPass && rowsPass && timePass;

        return {
            testId: test.id,
            name: test.name,
            pass,
            duration,
            generatedSql: allSql,
            responseText: result.text?.substring(0, 500),
            rowCount,
            tokensUsed: result.usage?.totalTokens || null,
            checks: {
                sql: { pass: sqlPass, details: sqlChecks },
                columns: { pass: columnsPass, details: columnChecks },
                rows: { pass: rowsPass, expected: test.expected_min_rows, actual: rowCount },
                time: { pass: timePass, limit: test.max_execution_time, actual: duration },
            },
            error: lastResult?.error || null,
        };
    } catch (err) {
        const endTime = performance.now();
        return {
            testId: test.id,
            name: test.name,
            pass: false,
            duration: Math.round(endTime - startTime),
            error: err.message,
            checks: {},
        };
    }
}

/**
 * Run all tests sequentially.
 * @param {string} projectPath
 * @param {object} aiManager
 * @param {object} dbManager
 * @returns {Promise<object>} Summary with results array
 */
async function runAllTests(projectPath, aiManager, dbManager) {
    const tests = await loadTests(projectPath);
    if (tests.length === 0) {
        return { total: 0, passed: 0, failed: 0, results: [] };
    }

    const results = [];
    for (const test of tests) {
        console.log(`[AI Tests] Running: ${test.name}`);
        const result = await runTest(test, aiManager, dbManager);
        results.push(result);
        console.log(`[AI Tests] ${result.pass ? 'PASS' : 'FAIL'}: ${test.name} (${result.duration}ms)`);
    }

    const passed = results.filter(r => r.pass).length;
    return {
        total: results.length,
        passed,
        failed: results.length - passed,
        results,
    };
}

module.exports = { loadTests, runTest, runAllTests };
