/**
 * La política de IA de un workspace (B4), fase 7.3 del plan de la 5.9.
 *
 *     node scripts/probarPoliticaIA.mjs
 *
 * Un proveedor FALSO (MockLanguageModelV3) hace de modelo en la nube: guarda
 * todo lo que recibe y pide herramientas como lo haría uno de verdad
 * (execute_sql, describe_table). La prueba busca los valores de la tabla de
 * prueba, literalmente, en todo lo que el modelo recibió.
 *
 *   - «esquema»: ningún valor aparece en ninguna carga enviada; las columnas sí.
 *   - «muestras»: sólo las 5 primeras filas.
 *   - «filas»: aparecen (así se sabe que la prueba detecta de verdad).
 *   - «local»: elegir un proveedor en la nube falla con un mensaje claro.
 *
 * Todo en un AMOXSQL_HOME temporal, con el servidor de verdad.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-politica-'));
const HOME = path.join(TMP, 'home');
const PROYECTO = path.join(TMP, 'clinica');
fs.mkdirSync(HOME, { recursive: true });
fs.mkdirSync(PROYECTO, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
const aiManager = require(path.join(RAIZ, 'server/AiManager.js'));
const politica = require(path.join(RAIZ, 'server/ai/politica.js'));
const { MockLanguageModelV3 } = require('ai/test');

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// Valores inconfundibles: si aparecen en lo que recibe el modelo, salieron.
const FILAS = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, paciente: `PACIENTE-${7700 + i}X`, saldo: 991100 + i }));
const LITERALES = FILAS.flatMap(f => [f.paciente, String(f.saldo)]);
const presentes = (texto) => LITERALES.filter(l => texto.includes(l));

// ── El proveedor falso ──────────────────────────────────────────────────────
const recibido = [];
const uso = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const corriente = (partes) => new ReadableStream({ start(c) { for (const p of partes) c.enqueue(p); c.close(); } });
const llamada = (toolName, input) => corriente([
    { type: 'stream-start', warnings: [] },
    { type: 'tool-call', toolCallId: `c-${toolName}-${recibido.length}`, toolName, input: JSON.stringify(input) },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: uso },
]);
const texto = (t) => corriente([
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: t }, { type: 'text-end', id: 't' },
    { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: uso },
]);
function modeloFalso() {
    return new MockLanguageModelV3({
        provider: 'anthropic', modelId: 'claude-prueba',
        doStream: async (opciones) => {
            const todo = JSON.stringify(opciones.prompt);
            recibido.push(todo);
            const hechas = (todo.match(/"type":"tool-result"/g) || []).length;
            if (hechas === 0) return { stream: llamada('execute_sql', { query: 'SELECT * FROM pacientes ORDER BY id' }) };
            if (hechas === 1) return { stream: llamada('describe_table', { table_name: 'pacientes' }) };
            return { stream: texto('Listo.') };
        },
        doGenerate: async (opciones) => {
            recibido.push(JSON.stringify(opciones.prompt));
            return { content: [{ type: 'text', text: 'ok' }], finishReason: { unified: 'stop', raw: undefined }, usage: uso, warnings: [] };
        },
    });
}
aiManager._crearModelo = (proveedor) => (proveedor === 'ollama' ? { local: true } : modeloFalso());

/** Una conversación entera con el asistente, como la manda la interfaz. */
async function conversar() {
    recibido.length = 0;
    const gen = aiManager.streamChatAgentic({
        messages: [{ role: 'user', content: 'Who owes the most?' }],
        dbManager,
        providerOverride: 'anthropic', modelOverride: 'claude-prueba',
        mode: 'diving', maxIterations: 2,
        tables: [{ name: 'pacientes', columns: [{ name: 'id', type: 'INTEGER' }, { name: 'paciente', type: 'VARCHAR' }, { name: 'saldo', type: 'INTEGER' }], rows: 7 }],
        // Lo que el usuario tiene en pantalla, con filas: también es una salida.
        currentResult: { columns: [{ name: 'paciente' }], rowCount: 7, sample: FILAS.map(f => ({ paciente: f.paciente })) },
        memoryExtraction: 'off',
    });
    const eventos = [];
    for await (const e of gen) eventos.push(e);
    return { eventos, todo: recibido.join('\n') };
}

try {
    const { port } = await startServer(0);
    const u = (p) => `http://localhost:${port}${p}`;
    const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(r => r.json());
    const post = pedir('POST'), put = pedir('PUT'), get = pedir('GET');
    for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await dormir(100);

    await post('/api/project/open', { path: PROYECTO });
    await post('/api/db/connect', { path: path.join(PROYECTO, 'clinica.duckdb') });
    await dbManager.query(`CREATE TABLE pacientes (id INTEGER, paciente VARCHAR, saldo INTEGER)`);
    for (const f of FILAS) await dbManager.query(`INSERT INTO pacientes VALUES (${f.id}, '${f.paciente}', ${f.saldo})`);

    const w = await post('/api/workspaces', { nombre: 'Clínica Vida', politicaIa: { proveedores: 'nube', datos: 'esquema' } });
    await put('/api/project/workspace', { workspaceId: w.id });
    const p = await get('/api/ai/politica');
    comprobar('\n  [preparar] la política del workspace rige al enlazar la carpeta', p.datos === 'esquema' && p.restringe === true && p.workspace?.nombre === 'Clínica Vida', JSON.stringify(p));

    console.log('\n«esquema»: sólo nombres y tipos');
    let r = await conversar();
    comprobar('el modelo falso recibió la conversación entera (3 llamadas)', recibido.length >= 3, `${recibido.length} llamadas`);
    comprobar('las herramientas corrieron: el modelo ve sus resultados', /"toolName":"execute_sql"/.test(r.todo) && /"toolName":"describe_table"/.test(r.todo));
    comprobar('NINGÚN valor de la tabla aparece en nada de lo enviado', presentes(r.todo).length === 0, presentes(r.todo).slice(0, 4).join(', '));
    comprobar('pero sí las columnas y el recuento', /paciente/.test(r.todo) && /"rowCount":7/.test(r.todo));
    comprobar('y el modelo sabe por qué faltan', /withheld by the AI policy/.test(r.todo));
    comprobar('la interfaz sí recibe las filas (no es la interfaz quien filtra)',
        JSON.stringify(r.eventos).includes(FILAS[0].paciente), 'sin filas en los eventos');

    console.log('\n«muestras»: las 5 primeras filas');
    await put(`/api/workspaces/${w.id}`, { politicaIa: { proveedores: 'nube', datos: 'muestras' } });
    r = await conversar();
    const enviados = FILAS.filter(f => r.todo.includes(f.paciente)).map(f => f.id);
    comprobar('sólo las filas 1 a 5', enviados.join() === '1,2,3,4,5', `filas enviadas: ${enviados.join()}`);

    console.log('\n«filas»: todo, como hasta la 5.8 (la prueba sí detecta)');
    await put(`/api/workspaces/${w.id}`, { politicaIa: { proveedores: 'nube', datos: 'filas' } });
    r = await conversar();
    comprobar('los valores aparecen', presentes(r.todo).length === LITERALES.length, `${presentes(r.todo).length} de ${LITERALES.length}`);

    console.log('\n«local»: sólo modelos en esta máquina');
    await put(`/api/workspaces/${w.id}`, { politicaIa: { proveedores: 'local', datos: 'filas' } });
    let error = null;
    try { aiManager.getModel('anthropic', 'claude-prueba'); } catch (x) { error = x.message; }
    comprobar('elegir uno en la nube falla', !!error);
    comprobar('con un mensaje claro, que nombra el workspace', /only allows local models/.test(error || '') && /Clínica Vida/.test(error || ''), error);
    let local = null;
    try { local = aiManager.getModel('ollama', 'qwen3:1.7b'); } catch (x) { error = x.message; }
    comprobar('uno local, sí', !!local);
    recibido.length = 0;
    let errConversacion = null;
    try { await conversar(); } catch (x) { errConversacion = x.message; }
    const finales = recibido.length;
    comprobar('y una conversación con la nube no llega a enviar nada', finales === 0, `${finales} envíos; ${errConversacion || ''}`);

    console.log('\nlo demás que sale hacia un modelo');
    await put(`/api/workspaces/${w.id}`, { politicaIa: { proveedores: 'nube', datos: 'esquema' } });
    comprobar('no se extraen memorias con la nube', politica.permiteMemorias('anthropic') === false && politica.permiteMemorias('ollama') === true);
    const csv = politica.filtrarSalida('read_file', { path: 'datos/pacientes.csv', content: FILAS.map(f => f.paciente).join('\n'), size: 10, lines: 7 }, 'esquema');
    const sql = politica.filtrarSalida('read_file', { path: 'consultas/deuda.sql', content: 'SELECT 1', size: 8, lines: 1 }, 'esquema');
    comprobar('leer un CSV no manda su contenido; un .sql sí', csv.content === '' && sql.content === 'SELECT 1');
    let errEnrich = null;
    try { politica.comprobarFilas('anthropic', await politica.deProyecto(PROYECTO)); } catch (x) { errEnrich = x.message; }
    comprobar('el paso de IA de Data Flow se niega a mandar filas a la nube', /doesn't allow sending rows/.test(errEnrich || ''), errEnrich);
    let okLocal = true;
    try { politica.comprobarFilas('ollama', await politica.deProyecto(PROYECTO)); } catch { okLocal = false; }
    comprobar('con un modelo local, sí', okLocal);

    console.log('\nsin workspace, nada cambia');
    await put('/api/project/workspace', { workspaceId: null });
    const sin = await get('/api/ai/politica');
    comprobar('la política vuelve a la de siempre', sin.datos === 'filas' && sin.proveedores === 'nube' && sin.restringe === false, JSON.stringify(sin));
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    await dbManager.close().catch(() => {});
    await baseCentral.cerrar().catch(() => {});
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows suelta los archivos tarde */ }
console.log(`\n${pasadas} pasadas, ${fallos} fallos\n`);
process.exit(fallos ? 1 : 0);
