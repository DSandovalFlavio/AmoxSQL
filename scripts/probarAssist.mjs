/**
 * El Assistant de los archivos (plan `docs/dev/plan_ux_assistant.md`), fase E1:
 * que no rompa ni filtre.
 *
 *     node scripts/probarAssist.mjs
 *
 * 1. El archivo activo (`server/ai/archivoActivo.js`): qué es cada tipo, qué sale
 *    hacia el modelo (fotos del Canvas, credenciales, filas con la política), el
 *    tope, y en cuáles puede proponer cambios.
 * 2. La política (`sanearOpciones`) aplica todo eso en el único embudo.
 * 3. El prompt dice el tipo y el idioma; no le llama «query» a un deck.
 * 4. Las herramientas: `write_file` solo en los archivos que la admiten, y sin
 *    escribir nada; `propose_file` no escribe ni pisa.
 * 5. El estado de una propuesta en el cliente (`propuestas.js`).
 * 6. El servidor de verdad: guarda el estado de una propuesta en su mensaje y crea
 *    un archivo propuesto sin pisar ninguno.
 *
 * Casa temporal: no toca ~/.amoxsql.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-assist-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'proyecto');
fs.mkdirSync(path.join(P, 'queries'), { recursive: true });
fs.writeFileSync(path.join(P, 'queries', 'existe.sql'), 'SELECT 1;\n');

const require = createRequire(import.meta.url);
let ok = 0, mal = 0;
const bien = (nombre, cond, detalle = '') => {
    cond ? ok++ : mal++;
    console.log(`${cond ? '  ok ' : '  MAL'} ${nombre}${cond || !detalle ? '' : ` → ${detalle}`}`);
};

const { prepararArchivo, tipoDe, esCredencial } = require(path.join(RAIZ, 'server/ai/archivoActivo.js'));
const politica = require(path.join(RAIZ, 'server/ai/politica.js'));
const { buildSystemPrompt } = require(path.join(RAIZ, 'server/ai/prompt/index.js'));
const { createTools } = require(path.join(RAIZ, 'server/ai/tools.js'));
const prop = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/propuestas.js')).href);

// ── 1. El archivo activo ────────────────────────────────────────────────────
console.log('\nel archivo activo');
{
    const casos = [['sql', 'a.sql', 'sql'], ['sqlnb', 'a.sqlnb', 'cuaderno'], ['md', 'a.md', 'markdown'], ['amoxdeck', 'a.amoxdeck', 'deck'],
        ['amoxvis', 'a.amoxvis', 'grafico'], ['sqlchain', 'a.sqlchain', 'flujo'], ['amoxcanvas', 'a.amoxcanvas', 'lienzo'],
        ['amoxdiagram', 'a.amoxdiagram', 'diagrama'], ['texto', 'a.yml', 'texto']];
    bien('cada tipo de pestaña tiene su tipo', casos.every(([t, r, e]) => tipoDe(r, t) === e), JSON.stringify(casos.map(([t, r]) => tipoDe(r, t))));
    bien('sin tipo de pestaña, por la extensión', tipoDe('x/informe.amoxdeck', null) === 'deck' && tipoDe('config.yaml', null) === 'texto');
    const proponen = casos.map(([t, r]) => [t, prepararArchivo({ filePath: r, fileType: t, contenido: 'x' }).puedeProponer]);
    bien('proponen sql, notebook, md, deck y texto; no los estructurados',
        JSON.stringify(Object.fromEntries(proponen)) === JSON.stringify({ sql: true, sqlnb: true, md: true, amoxdeck: true, amoxvis: false, sqlchain: false, amoxcanvas: false, amoxdiagram: false, texto: true }),
        JSON.stringify(proponen));
}
{
    const lienzo = JSON.stringify({ formato: 'amoxcanvas', tarjetas: [
        { id: 'a', tipo: 'query', sql: ['SELECT * FROM ventas'], foto: { columnas: ['region'], filas: [['Sur'], ['Norte']] } },
        { id: 'b', tipo: 'note', texto: 'hola' },
    ] });
    const a = prepararArchivo({ filePath: 'e.amoxcanvas', fileType: 'amoxcanvas', contenido: lienzo, datos: 'filas', local: true });
    bien('Canvas: las fotos no salen nunca, ni con «filas» y un modelo local', !a.contenido.includes('Sur') && !a.contenido.includes('foto') && a.contenido.includes('SELECT * FROM ventas'));
    bien('Canvas: lo dice en una nota', a.notas.some(n => n.includes('snapshots')));
}
{
    bien('credenciales: profiles.yml, .env, .env.local, id_rsa, x.pem, aws_credentials', ['profiles.yml', '.env', 'conf/.env.local', 'id_rsa', 'x.pem', 'aws_credentials'].every(esCredencial));
    bien('no son credenciales: metrics.yml, schema.yml, env.sql', !['context/metrics.yml', 'models/schema.yml', 'env.sql'].some(esCredencial));
    const nube = prepararArchivo({ filePath: 'profiles.yml', fileType: 'texto', contenido: 'password: secreta', datos: 'filas', local: false });
    bien('profiles.yml con un modelo en la nube: no sale nada, ni con «filas»', nube.contenido === '' && !JSON.stringify(nube).includes('secreta') && nube.retenido && !nube.puedeProponer);
    const local = prepararArchivo({ filePath: 'profiles.yml', fileType: 'texto', contenido: 'password: secreta', datos: 'filas', local: true });
    bien('profiles.yml con un modelo local: sí (no sale de la máquina)', local.contenido.includes('secreta') && local.idioma === 'yaml');
}
{
    const spec = JSON.stringify({ mark: 'bar', data: { values: [{ region: 'Sur', venta: 10 }] }, usermeta: { amoxsql: { consulta: 'SELECT 1' } } });
    const esq = prepararArchivo({ filePath: 'g.amoxvis', fileType: 'amoxvis', contenido: spec, datos: 'esquema', local: false });
    bien('gráfico con «esquema»: sin las filas del spec, con la consulta', !esq.contenido.includes('Sur') && esq.contenido.includes('SELECT 1') && esq.retenido);
    const filas = prepararArchivo({ filePath: 'g.amoxvis', fileType: 'amoxvis', contenido: spec, datos: 'filas', local: false });
    bien('gráfico con «filas»: tal cual', filas.contenido.includes('Sur'));
}
{
    const datos = '{"id":1,"cliente":"Ana"}\n{"id":2,"cliente":"Luis"}\n'.repeat(10);
    const esq = prepararArchivo({ filePath: 'clientes.jsonl', fileType: 'texto', contenido: datos, datos: 'esquema', local: false });
    bien('archivo de datos con «esquema»: no sale', esq.contenido === '' && esq.notas.length > 0);
    const mue = prepararArchivo({ filePath: 'clientes.jsonl', fileType: 'texto', contenido: datos, datos: 'muestras', local: false });
    bien('archivo de datos con «muestras»: sus primeras líneas', mue.contenido.split('\n').length <= 6 && mue.contenido.includes('Ana'));
    const yml = prepararArchivo({ filePath: 'context/metrics.yml', fileType: 'texto', contenido: 'metrics: []', datos: 'esquema', local: false });
    bien('un .yml del proyecto no es un archivo de datos', yml.contenido === 'metrics: []' && yml.puedeProponer);
}
{
    const largo = Array.from({ length: 3000 }, (_, i) => `SELECT ${i} AS n;`).join('\n');
    const a = prepararArchivo({ filePath: 'largo.sql', fileType: 'sql', contenido: largo });
    bien('tope: un archivo largo se recorta por líneas enteras', a.contenido.length <= 16000 && a.contenido.endsWith(';'));
    bien('tope: lo dice y deja de proponer (perdería lo que no ve)', a.notas.some(n => n.includes('more line')) && !a.puedeProponer);
}

// ── 2. La política ──────────────────────────────────────────────────────────
console.log('\nla política');
{
    politica.fijar({ proveedores: 'nube', datos: 'filas' });
    const deck = politica.sanearOpciones({ mode: 'assistant', filePath: 'cierre.amoxdeck', fileType: 'amoxdeck', currentQuery: '---\ntitle: Cierre\n---' }, 'ollama');
    bien('un deck: currentQuery queda vacío y va en `archivo`', deck.currentQuery === '' && deck.archivo?.tipo === 'deck' && deck.archivo.contenido.includes('Cierre'));
    const sql = politica.sanearOpciones({ mode: 'assistant', filePath: 'a.sql', fileType: 'sql', currentQuery: 'SELECT 1' }, 'ollama');
    bien('un .sql: currentQuery sigue siendo la consulta', sql.currentQuery === 'SELECT 1' && sql.archivo?.tipo === 'sql');
    const dd = politica.sanearOpciones({ mode: 'diving', currentQuery: 'SELECT 1' }, 'ollama');
    bien('Deep Dive no se toca', dd.currentQuery === 'SELECT 1' && !dd.archivo);
    politica.fijar({ proveedores: 'nube', datos: 'esquema' });
    const lienzo = politica.sanearOpciones({ mode: 'assistant', filePath: 'e.amoxcanvas', fileType: 'amoxcanvas',
        currentQuery: JSON.stringify({ tarjetas: [{ id: 'a', foto: { filas: [['secreto']] } }] }) }, 'gemini');
    bien('con «esquema» y Gemini, la foto del Canvas no llega', !JSON.stringify(lienzo).includes('secreto'));
    politica.fijar({ proveedores: 'nube', datos: 'filas' });
}

// ── 3. El prompt ────────────────────────────────────────────────────────────
console.log('\nel prompt');
{
    const prompt = (filePath, fileType, contenido) => {
        const o = politica.sanearOpciones({ mode: 'assistant', filePath, fileType, currentQuery: contenido }, 'ollama');
        return buildSystemPrompt({ ...o, modelProfile: { tier: 'high' } });
    };
    const deck = prompt('cierre.amoxdeck', 'amoxdeck', '---\ntitle: Cierre\n---\n# Hola');
    bien('deck: lo llama Report Flow deck, en un bloque markdown', deck.includes('Report Flow deck') && deck.includes('```markdown\n---\ntitle: Cierre'));
    bien('deck: nunca «Current query (editor)»', !deck.includes('Current query (editor)'));
    bien('deck: puede proponer, conservando las directivas', deck.includes('**write_file**: proposes') && deck.includes('layout directives'));
    const sql = prompt('a.sql', 'sql', 'SELECT 1');
    bien('.sql: sigue siendo «Current query (editor)»', sql.includes('Current query (editor)') && sql.includes('SELECT 1'));
    const flujo = prompt('cierre.sqlchain', 'sqlchain', '{"nodes":[]}');
    bien('Data Flow: no puede proponer y lo explica', flujo.includes('You cannot propose changes to this file') && flujo.includes('```json'));
    bien('Data Flow: «Apply to chart» no se ofrece', flujo.includes('cannot be applied to this file'));
    bien('nunca «SQL editor or notebook»', !deck.includes('SQL editor or notebook'));
    bien('la parte fija ya no ofrece create/append', !deck.includes("mode='create'") && deck.includes('propose_file'));
}

// ── 4. Las herramientas ─────────────────────────────────────────────────────
console.log('\nlas herramientas');
{
    const con = (tipo) => createTools({ dbManager: null, queryResults: new Map(), projectPath: P, mode: 'assistant',
        archivo: prepararArchivo({ filePath: `x.${tipo}`, fileType: tipo, contenido: 'x' }) });
    bien('write_file en .sql, notebook y deck', ['sql', 'sqlnb', 'amoxdeck'].every(t => !!con(t).write_file));
    bien('sin write_file en gráfico, Data Flow, Canvas y diagrama', ['amoxvis', 'sqlchain', 'amoxcanvas', 'amoxdiagram'].every(t => !con(t).write_file));
    bien('propose_file en todos', ['sql', 'amoxcanvas'].every(t => !!con(t).propose_file));
    const t = con('sql');
    const w = await t.write_file.execute({ content: 'SELECT 2', mode: 'create', file_path: 'queries/pisado.sql' }, {});
    bien('write_file solo propone, aunque le pidan «create»', w.action === 'edit_file' && !fs.existsSync(path.join(P, 'queries/pisado.sql')));
    const n = await t.propose_file.execute({ file_path: 'queries/nuevo.sql', content: 'SELECT 3' }, {});
    bien('propose_file no escribe', n.action === 'propose_file' && n.path === 'queries/nuevo.sql' && !fs.existsSync(path.join(P, 'queries/nuevo.sql')));
    const e = await t.propose_file.execute({ file_path: 'queries/existe.sql', content: 'SELECT 4' }, {});
    bien('propose_file sobre uno que existe: error, sin tocarlo', !!e.error && fs.readFileSync(path.join(P, 'queries/existe.sql'), 'utf8') === 'SELECT 1;\n');
    const f = await t.propose_file.execute({ file_path: '../fuera.sql', content: 'x' }, {});
    bien('propose_file fuera del proyecto: error', !!f.error);
    const sinArchivo = createTools({ dbManager: null, queryResults: new Map(), projectPath: P, mode: 'assistant' });
    bien('sin archivo activo conocido, write_file sigue (compatibilidad)', !!sinArchivo.write_file);
}

// ── 5. El estado de una propuesta (cliente) ─────────────────────────────────
console.log('\nel estado de una propuesta');
{
    const cambio = { toolCallId: 'w1', toolName: 'write_file', result: { action: 'edit_file', content: 'SELECT 2' } };
    const nuevo = { toolCallId: 'p1', toolName: 'propose_file', result: { action: 'propose_file', path: 'a.sql', content: 'x' } };
    const error = { toolCallId: 'p2', toolName: 'propose_file', result: { error: 'existe' } };
    bien('huella estable y distinta', prop.huella('a') === prop.huella('a') && prop.huella('a') !== prop.huella('b'));
    bien('una propuesta con error no es propuesta', !prop.esPropuesta(error) && prop.esPropuesta(cambio) && prop.esPropuesta(nuevo));
    bien('sin estado guardado: «anterior», no hecha', prop.estadoDe(cambio, 'SELECT 1') === 'anterior');
    const [c, nv] = prop.marcarPropuestas([cambio, nuevo, error], 'SELECT 1');
    bien('al recibirla queda pendiente con la huella del archivo', c.estado === 'propuesta' && c.base === prop.huella('SELECT 1') && nv.estado === 'propuesta' && !nv.base);
    bien('pendiente mientras el archivo es el mismo', prop.estadoDe(c, 'SELECT 1') === 'propuesta');
    bien('caducada si el archivo cambió', prop.estadoDe(c, 'SELECT 1 -- editado') === 'caducada');
    bien('un archivo nuevo no caduca', prop.estadoDe(nv, 'otra cosa') === 'propuesta');
    bien('aplicada y rechazada se ven como tales', prop.estadoDe({ ...c, estado: 'aplicada' }, 'x') === 'aplicada' && prop.estadoDe({ ...c, estado: 'rechazada' }, 'x') === 'rechazada');
    const msgs = prop.conEstado([{ id: 'm', toolCalls: [c, nv] }, { id: 'n' }], 'w1', 'aplicada');
    bien('conEstado cambia solo esa llamada', msgs[0].toolCalls[0].estado === 'aplicada' && msgs[0].toolCalls[1].estado === 'propuesta' && msgs[1].id === 'n');
}

// ── 6. El servidor ──────────────────────────────────────────────────────────
console.log('\nel servidor');
try {
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (q, b) => fetch(`http://localhost:${port}${q}`, b === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
        .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
    await pedir('/api/project/open', { path: P });
    await pedir('/api/db/connect', { path: 'prueba.duckdb' });

    const conv = await pedir('/api/ai/conversations', { mode: 'assistant', title: 'Prueba', file_path: 'queries/existe.sql' });
    bien('se crea la conversación', !!conv.id, JSON.stringify(conv).slice(0, 200));
    const llamadas = [
        { toolCallId: 'x1', toolName: 'execute_sql', args: { query: 'SELECT 1' }, result: { rowCount: 1 } },
        { toolCallId: 'w_1', toolName: 'write_file', args: {}, result: { action: 'edit_file', content: 'SELECT 2' }, estado: 'propuesta', base: 'abc' },
    ];
    await pedir(`/api/ai/conversations/${conv.id}/messages`, { role: 'assistant', content: 'te propongo', toolCalls: llamadas });
    const d = await pedir(`/api/ai/conversations/${conv.id}/propuestas/w_1`, { estado: 'aplicada' });
    bien('el estado de una propuesta se guarda', d.guardada === true, JSON.stringify(d));
    const leida = await pedir(`/api/ai/conversations/${conv.id}`);
    const tc = leida.messages?.find(m => m.role === 'assistant')?.tool_calls?.find(t => t.toolCallId === 'w_1');
    bien('al reabrir, la propuesta dice «aplicada» (y conserva su huella)', tc?.estado === 'aplicada' && tc.base === 'abc', JSON.stringify(tc));
    const otra = leida.messages?.find(m => m.role === 'assistant')?.tool_calls?.find(t => t.toolCallId === 'x1');
    bien('las demás llamadas del mensaje no cambian', otra && !otra.estado && otra.result.rowCount === 1);
    const nada = await pedir(`/api/ai/conversations/${conv.id}/propuestas/nadie`, { estado: 'rechazada' });
    bien('una propuesta que no está: guardada false (el cliente la guarda con su mensaje)', nada.guardada === false);
    const malo = await pedir(`/api/ai/conversations/${conv.id}/propuestas/w_1`, { estado: 'borrada' });
    bien('un estado que no existe: 400', malo.status === 400);

    const c1 = await pedir('/api/ai/propuestas/crear-archivo', { path: 'queries/nuevo/top.sql', content: 'SELECT 5;\n' });
    bien('Create: crea el archivo (y su carpeta)', c1.success && fs.readFileSync(path.join(P, 'queries/nuevo/top.sql'), 'utf8') === 'SELECT 5;\n', JSON.stringify(c1));
    const c2 = await pedir('/api/ai/propuestas/crear-archivo', { path: 'queries/existe.sql', content: 'PISADO' });
    bien('Create sobre uno que existe: 409 y no lo toca', c2.status === 409 && fs.readFileSync(path.join(P, 'queries/existe.sql'), 'utf8') === 'SELECT 1;\n');
    const c3 = await pedir('/api/ai/propuestas/crear-archivo', { path: '../fuera.sql', content: 'x' });
    bien('Create fuera del proyecto: 400', c3.status === 400 && !fs.existsSync(path.join(TMP, 'fuera.sql')));

    await baseCentral.cerrar();
} catch (x) {
    mal++;
    console.log('  MAL inesperado:', x.stack || x.message);
}

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
