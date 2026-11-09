/**
 * El Assistant de los archivos (plan `docs/dev/plan_ux_assistant.md`): E1 (que no
 * rompa ni filtre) y E2 (por líneas: el diff, la ubicación de una propuesta, el
 * foco, el error, el prompt numerado y `propose_change`).
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
import { createRequire, register } from 'node:module';
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
// El código del cliente importa sin extensión (lo resuelve Vite) y sus paquetes
// viven en client/node_modules: un gancho de resolución hace lo mismo en Node (E4:
// el deck y el gráfico usan deckParser, deckTemplates y Story Flow).
const CLIENTE = path.join(RAIZ, 'client');
register('data:text/javascript,' + encodeURIComponent(`
    const CLIENTE = ${JSON.stringify(pathToFileURL(CLIENTE + '/package.json').href)};
    export async function resolve(esp, ctx, sig) {
        if (/^\\.\\.?\\//.test(esp) && !/\\.[cm]?jsx?$/.test(esp)) {
            try { return await sig(esp + '.js', ctx); } catch { /* sigue */ }
        }
        if (!/^(node:|data:|file:|\\.|\\/)/.test(esp)) {
            try { return await sig(esp, ctx); } catch { return sig(esp, { ...ctx, parentURL: CLIENTE }); }
        }
        return sig(esp, ctx);
    }
`));
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
    // E5: Data Flow ya propone por pasos; un Canvas sin la estructura de su editor (un cliente viejo), no.
    bien('Data Flow: propone por pasos', flujo.includes('operations on its steps') && !flujo.includes('You cannot propose'));
    const lienzoViejo = prompt('c.amoxcanvas', 'amoxcanvas', '{"tarjetas":[]}');
    bien('Canvas sin estructura: no puede proponer y lo explica', lienzoViejo.includes('You cannot propose changes to this file') && lienzoViejo.includes('```json'));
    bien('Data Flow: «Apply to chart» no se ofrece', flujo.includes('cannot be applied to this file'));
    bien('nunca «SQL editor or notebook»', !deck.includes('SQL editor or notebook'));
    bien('la parte fija ya no ofrece create/append', !deck.includes("mode='create'") && deck.includes('propose_file'));
}

// ── 4. Las herramientas ─────────────────────────────────────────────────────
console.log('\nlas herramientas');
{
    const con = (tipo) => createTools({ dbManager: null, queryResults: new Map(), projectPath: P, mode: 'assistant',
        archivo: prepararArchivo({ filePath: `x.${tipo}`, fileType: tipo, contenido: 'x' }) });
    bien('write_file en notebook y deck (el .sql usa propose_change desde E2)', ['sqlnb', 'amoxdeck'].every(t => !!con(t).write_file) && !con('sql').write_file);
    bien('sin write_file en gráfico, Data Flow, Canvas y diagrama', ['amoxvis', 'sqlchain', 'amoxcanvas', 'amoxdiagram'].every(t => !con(t).write_file));
    bien('propose_file en todos', ['sql', 'amoxcanvas'].every(t => !!con(t).propose_file));
    const t = con('sqlnb');
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

// ── E2. Por líneas: el diff, la ubicación, el foco, el prompt y propose_change ──
console.log('\nE2 · el diff por líneas');
{
    const { diffLineas } = await import(pathToFileURL(path.join(RAIZ, 'client/src/utils/diffLineas.js')).href);
    const d1 = diffLineas('a\nb\nc', 'a\nB\nc');
    bien('una línea cambia: sale una, entra una, un bloque', d1.quitadas === 1 && d1.agregadas === 1 && d1.bloques.length === 1 && d1.bloques[0].desdeA === 1 && d1.bloques[0].sale[0] === 'b' && d1.bloques[0].entra[0] === 'B');
    const d2 = diffLineas('a\nb', 'a\nb\nc');
    bien('una línea entra al final', d2.quitadas === 0 && d2.agregadas === 1 && d2.bloques[0].desdeA === 2);
    const d3 = diffLineas('x\na\nb\ny', 'x\ny');
    bien('dos líneas salen', d3.quitadas === 2 && d3.agregadas === 0);
    const d4 = diffLineas('a\nb\nc\nd', 'b\nc\nd\na');
    bien('una línea movida: sale de su sitio y entra en el otro (no «todo cambió»)', d4.quitadas === 1 && d4.agregadas === 1);
    const d5 = diffLineas('x\nx\ny', 'x\ny');
    bien('una línea repetida: sale solo una', d5.quitadas === 1 && d5.agregadas === 0);
    bien('igual: sin bloques', diffLineas('a\nb', 'a\nb').bloques.length === 0);
    bien('desde nada (inserción): todo entra', diffLineas([], 'a\nb').agregadas === 2 && diffLineas([], 'a\nb').quitadas === 0);
}

console.log('\nE2 · ubicar una propuesta por líneas');
{
    const { ubicarRango, aplicarRango, describirRango } = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/archivos/rango.js')).href);
    const texto = 'SELECT 1;\n\nSELECT a,\n       b\nFROM t;\n';
    const p = { action: 'propose_change', objetivo: { tipo: 'rango', desde: 3, hasta: 4 }, original: 'SELECT a,\n       b', contenido: 'SELECT a, b, c', ancla: { antes: '', despues: 'FROM t;' } };
    bien('donde dice', JSON.stringify(ubicarRango(texto, p)) === '{"desde":3,"hasta":4}');
    const corrido = '-- nota\n-- otra\n' + texto;
    bien('las líneas se corrieron (escribió arriba): la encuentra', JSON.stringify(ubicarRango(corrido, p)) === '{"desde":5,"hasta":6}');
    bien('esa parte cambió: caducada', ubicarRango(texto.replace('       b', '       bb'), p) === null);
    bien('el texto está dos veces: no adivina', ubicarRango(texto + 'SELECT a,\n       b\n', { ...p, objetivo: { tipo: 'rango', desde: 99, hasta: 100 } }) === null);
    const a = aplicarRango(corrido, p);
    bien('aplicar: solo esas líneas, el resto igual', a.texto === '-- nota\n-- otra\nSELECT 1;\n\nSELECT a, b, c\nFROM t;\n');
    const ins = { action: 'propose_change', objetivo: { tipo: 'rango', desde: 5, hasta: 4 }, original: '', contenido: 'WHERE x > 0', ancla: { antes: '       b', despues: 'FROM t;' } };
    bien('inserción: se ubica entre sus vecinas', JSON.stringify(ubicarRango(texto, ins)) === '{"desde":5,"hasta":4}');
    bien('inserción aplicada antes de su línea', aplicarRango(texto, ins).texto.includes('       b\nWHERE x > 0\nFROM t;'));
    const borra = { action: 'propose_change', objetivo: { tipo: 'rango', desde: 1, hasta: 2 }, original: 'SELECT 1;\n', contenido: '', ancla: { antes: null, despues: 'SELECT a,' } };
    bien('borrar líneas: contenido vacío', aplicarRango(texto, borra).texto === 'SELECT a,\n       b\nFROM t;\n');
    bien('describir', describirRango(p) === 'lines 3–4' && describirRango(ins) === 'before line 5');
    const c = { toolCallId: 'r1', toolName: 'propose_change', result: p, estado: 'propuesta' };
    bien('estado: sigue pendiente aunque se escribiera arriba', prop.estadoDe(c, corrido) === 'propuesta');
    bien('estado: caducada si cambió esa parte', prop.estadoDe(c, texto.replace('       b', '       z')) === 'caducada');
    bien('al recibirla, sin huella del archivo entero', !prop.marcarPropuestas([{ ...c, estado: undefined }], texto)[0].base);
}

console.log('\nE2 · el foco y el inicio');
{
    const arch = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/archivos/index.js')).href);
    const sql = '-- panorama\nSELECT 1;\n\nSELECT a\nFROM t\nWHERE x;\n';
    bien('la sentencia bajo el cursor (línea 5)', JSON.stringify(arch.sentenciaEn(sql, 5)) === '{"desde":4,"hasta":6}');
    const f = arch.focoDeEditor({ texto: sql, tipo: 'sql', seleccion: { texto: '  ', desde: 2, hasta: 2 }, lineaCursor: 2 });
    bien('una selección de espacios no cuenta; queda la sentencia', f.seleccion === null && f.sentencia?.desde >= 1);
    bien('en texto no hay sentencia', arch.focoDeEditor({ texto: 'a: 1', tipo: 'texto', lineaCursor: 1 }).sentencia === null);
    bien('la barra: más de una palabra', arch.seleccionConBarra('venta_mes') === false && arch.seleccionConBarra('SELECT a') === true);
    const conError = arch.inicioDe({ type: 'sql', path: 'a.sql', content: 'SELECT x FROM t', resultsError: 'Binder Error' });
    bien('con error, lo primero es arreglarlo', conError[0]?.etiqueta === 'Fix the error' && conError[0].aviso);
    const conResultado = arch.inicioDe({ type: 'sql', path: 'a.sql', content: 'SELECT 1', results: { data: [{ a: 1 }] } });
    bien('con resultado: qué destaca y graficarlo', conResultado.some(o => o.etiqueta === 'Chart the result'));
    bien('vacío: escribir una consulta', arch.inicioDe({ type: 'sql', path: 'a.sql', content: '' })[0].etiqueta === 'Write a query…');
    bien('metrics.yml: añadir una medida', arch.inicioDe({ type: 'texto', path: 'context/metrics.yml', content: 'metrics: []' })[0].etiqueta === 'Add a measure');
    bien('un deck tiene el suyo', arch.inicioDe({ type: 'amoxdeck', path: 'x.amoxdeck', content: '---' }).length > 0);
}

console.log('\nE2 · el foco y el error en el servidor');
{
    const { prepararFoco, conocido, sinLiterales } = require(path.join(RAIZ, 'server/ai/archivoActivo.js'));
    const archivo = prepararArchivo({ filePath: 'a.sql', fileType: 'sql', contenido: 'SELECT 1;\nSELECT a\nFROM t;' });
    const e1 = prepararFoco({ archivo, foco: { seleccion: { texto: 'SELECT a', desde: 2, hasta: 2 }, sentencia: { desde: 2, hasta: 3 } } });
    bien('con selección, la selección', e1.seleccion?.texto === 'SELECT a' && !e1.sentencia);
    const e2 = prepararFoco({ archivo, foco: { seleccion: null, sentencia: { desde: 2, hasta: 3 } } });
    bien('sin selección, la sentencia con su texto', e2.sentencia?.texto === 'SELECT a\nFROM t;');
    bien('un rango que no existe se ignora', !prepararFoco({ archivo, foco: { sentencia: { desde: 40, hasta: 41 } } }).sentencia);
    const err = prepararFoco({ archivo, error: "Conversion Error: Could not convert string 'Ana López' to INT32", datos: 'esquema' });
    bien('el error, sin los valores que cita (política)', err.error.includes("'…'") && !err.error.includes('Ana'));
    bien('con «filas», el error entero', prepararFoco({ archivo, error: "x 'Ana'" }).error.includes('Ana'));
    const cred = prepararArchivo({ filePath: '.env', fileType: 'texto', contenido: 'KEY=1', local: false });
    bien('un archivo que no sale: tampoco su selección', !prepararFoco({ archivo: cred, foco: { seleccion: { texto: 'KEY=1', desde: 1, hasta: 1 } } }).seleccion);
    bien('archivos conocidos', /measures/.test(conocido('context/metrics.yml')) && /dbt properties/.test(conocido('models/staging/schema.yml')) && conocido('notas.txt') === null);
    bien('sinLiterales', sinLiterales("near 'abc'") === "near '…'");
    politica.fijar({ proveedores: 'nube', datos: 'esquema' });
    const o = politica.sanearOpciones({ mode: 'assistant', filePath: 'a.sql', fileType: 'sql', currentQuery: 'SELECT a FROM t', resultsError: "value 'Ana'", foco: { seleccion: { texto: 'SELECT a', desde: 1, hasta: 1 } } }, 'gemini');
    bien('sanearOpciones: el foco y el error pasan por la política', o.enfoque?.seleccion?.texto === 'SELECT a' && !o.enfoque.error.includes('Ana') && o.foco === undefined && o.resultsError === undefined);
    politica.fijar({ proveedores: 'nube', datos: 'filas' });
}

console.log('\nE2 · el prompt');
{
    const prompt = (extra) => {
        const o = politica.sanearOpciones({ mode: 'assistant', filePath: 'queries/a.sql', fileType: 'sql', currentQuery: 'SELECT 1;\nSELECT a\nFROM t;', ...extra }, 'ollama');
        return buildSystemPrompt({ ...o, modelProfile: { tier: 'high' } });
    };
    const p = prompt({ foco: { seleccion: null, sentencia: { desde: 2, hasta: 3 } }, resultsError: 'Binder Error: column "a" not found' });
    bien('las líneas van numeradas', p.includes('1 | SELECT 1;') && p.includes('3 | FROM t;'));
    bien('dónde está el usuario: la sentencia', p.includes('the statement at lines 2–3'));
    bien('el error de la última ejecución', p.includes('The last run failed') && p.includes('Binder Error'));
    bien('en un .sql se ofrece propose_change, no write_file', p.includes('**propose_change**: proposes replacing a range') && !p.includes('**write_file**: proposes'));
    const ps = prompt({ foco: { seleccion: { texto: 'SELECT a', desde: 2, hasta: 2 } } });
    bien('con selección: «this» es la selección', ps.includes('they selected line 2') && ps.includes('"This" means this selection'));
    const dbt = buildSystemPrompt({ ...politica.sanearOpciones({ mode: 'assistant', filePath: 'models/stg_x.sql', fileType: 'sql', currentQuery: "select * from {{ ref('raw') }}" }, 'ollama'),
        dbt: { nombre: 'stg_x', materializado: 'view', columnas: [{ nombre: 'id', descripcion: 'the key' }], compilado: 'select * from "tienda"."main"."raw"', fresco: false }, modelProfile: { tier: 'high' } });
    bien('dbt: se escribe en Jinja, con sus columnas y el compilado', dbt.includes('dbt model: `stg_x`') && dbt.includes("ref('…')") && dbt.includes('id (the key)') && dbt.includes('Compiled SQL of this dbt model') && dbt.includes('may be behind'));
    const md = buildSystemPrompt({ ...politica.sanearOpciones({ mode: 'assistant', filePath: 'a.md', fileType: 'md', currentQuery: '# Hola' }, 'ollama'), modelProfile: { tier: 'high' } });
    bien('Markdown (desde E3): por líneas, numerado, con propose_change', md.includes('**propose_change**: proposes replacing a range') && md.includes('1 | # Hola') && !md.includes('**write_file**: proposes'));
    const yml = buildSystemPrompt({ ...politica.sanearOpciones({ mode: 'assistant', filePath: 'context/metrics.yml', fileType: 'texto', currentQuery: 'metrics: []' }, 'ollama'), modelProfile: { tier: 'high' } });
    bien('texto: numerado, en su idioma y con lo que es', yml.includes('```yaml\n1 | metrics: []') && yml.includes('The project\'s measures'));
}

console.log('\nE2 · propose_change');
{
    const contenido = 'SELECT 1;\n\nSELECT a,\n       b\nFROM t;';
    const conArchivo = (filePath, fileType, texto = contenido) => createTools({ dbManager: null, queryResults: new Map(), projectPath: P, mode: 'assistant',
        archivo: prepararArchivo({ filePath, fileType, contenido: texto }) });
    const t = conArchivo('a.sql', 'sql');
    bien('.sql: propose_change sí, write_file no', !!t.propose_change && !t.write_file);
    bien('texto: propose_change', !!conArchivo('c.yml', 'texto').propose_change);
    bien('Markdown (desde E3): propose_change, sin write_file', !!conArchivo('a.md', 'md').propose_change && !conArchivo('a.md', 'md').write_file);
    const pc = (args) => t.propose_change.execute({ summary: '', ...args }, {});
    const r = await pc({ target: { kind: 'lines', start_line: 3, end_line: 4 }, new_text: 'SELECT a, b' });
    bien('un rango: trae lo que reemplaza y sus vecinas', r.action === 'propose_change' && r.original === 'SELECT a,\n       b' && r.ancla.antes === '' && r.ancla.despues === 'FROM t;' && r.objetivo.desde === 3);
    const fuera = await pc({ target: { kind: 'lines', start_line: 9, end_line: 9 }, new_text: 'x' });
    bien('fuera del archivo: error que dice cuántas líneas tiene', /has 5 lines/.test(fuera.error || ''));
    const corrido = await pc({ target: { kind: 'lines', start_line: 1, end_line: 1, current_text: 'FROM t;' }, new_text: 'FROM t2;' });
    bien('números equivocados pero el texto existe: se corrige el rango', corrido.objetivo?.desde === 5 && corrido.original === 'FROM t;');
    const noEsta = await pc({ target: { kind: 'lines', start_line: 1, end_line: 1, current_text: 'SELECT 99;' }, new_text: 'x' });
    bien('el texto no está: error con lo que hay en esas líneas', /don't match current_text/.test(noEsta.error || '') && noEsta.error.includes('SELECT 1;'));
    const igual = await pc({ target: { kind: 'lines', start_line: 1, end_line: 1 }, new_text: 'SELECT 1;' });
    bien('sin cambios: error', /nothing to change/.test(igual.error || ''));
    const ins = await pc({ target: { kind: 'lines', start_line: 5, end_line: 4 }, new_text: 'WHERE b > 0' });
    bien('inserción: original vacío, entre sus vecinas', ins.original === '' && ins.ancla.antes === '       b' && ins.ancla.despues === 'FROM t;');
    const pref = await pc({ target: { kind: 'lines', start_line: 1, end_line: 1 }, new_text: '1 | SELECT 2;' });
    bien('si el modelo copia el número de línea, se quita', pref.contenido === 'SELECT 2;');
    const { aplicarRango } = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/archivos/rango.js')).href);
    bien('lo que propone el servidor lo aplica el cliente', aplicarRango(contenido, r).texto === 'SELECT 1;\n\nSELECT a, b\nFROM t;');
}

// ── E3. El notebook por celdas y el Markdown por secciones ─────────────────
console.log('\nE3 · el notebook por celdas (cliente)');
{
    const cu = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/archivos/cuaderno.js')).href);
    const { leerCuaderno, escribirCuaderno } = await import(pathToFileURL(path.join(RAIZ, 'client/src/utils/cuadernoFile.js')).href);
    const celdas = [
        { id: 'a', tipo: 'texto', contenido: '# Ventas' },
        { id: 'b', tipo: 'sql', nombre: 'ventas_mes', materializada: false, contenido: 'SELECT mes, sum(importe) AS venta FROM ventas GROUP BY 1' },
        { id: 'c', tipo: 'sql', nombre: '', materializada: false, contenido: 'SELECT * FROM ventas_mes' },
    ];
    const est = cu.estructuraDeCuaderno({ meta: { parametros: { region: 'Sur' } }, celdas }, {
        analisis: { c: { lee: ['ventas_mes'] } }, resultados: { b: { data: [{ x: 1 }, { x: 2 }] }, c: { error: 'boom' } }, vivas: [{ nombre: 'ventas_mes' }],
    });
    bien('la estructura: número, tipo, nombre, qué lee, cómo corrió', est.celdas[1].n === 2 && est.celdas[1].nombre === 'ventas_mes' && est.celdas[1].filas === 2
        && est.celdas[2].lee[0] === 'ventas_mes' && est.celdas[2].estado === 'error' && est.celdas[0].tipo === 'texto' && est.parametros.region === 'Sur' && est.vivas[0] === 'ventas_mes');
    const cambio = { action: 'propose_change', objetivo: { tipo: 'celda', accion: 'cambiar', n: 3, celdaTipo: 'sql' }, original: 'SELECT * FROM ventas_mes', anclaNombre: null, contenido: 'SELECT mes FROM ventas_mes' };
    bien('cambiar: donde dice', JSON.stringify(cu.ubicarCelda(celdas, cambio)) === '{"indice":2,"insertar":false}');
    const movidas = [celdas[2], celdas[0], celdas[1]];
    bien('cambiar: la celda se movió, se encuentra por su texto', cu.ubicarCelda(movidas, cambio)?.indice === 0);
    bien('cambiar: su texto cambió, caducada', cu.ubicarCelda([celdas[0], celdas[1], { ...celdas[2], contenido: 'SELECT 1' }], cambio) === null);
    const conNombre = { ...cambio, objetivo: { ...cambio.objetivo, n: 2 }, original: celdas[1].contenido, anclaNombre: 'ventas_mes' };
    bien('una celda con nombre se busca por su nombre', cu.ubicarCelda(movidas, conNombre)?.indice === 2);
    bien('no se convierte una de SQL en texto', cu.ubicarCelda(celdas, { ...cambio, objetivo: { ...cambio.objetivo, celdaTipo: 'texto' } }) === null);
    const ap = cu.aplicarACeldas(celdas, cambio, () => 'nueva');
    bien('aplicar: cambia esa celda; las demás, las mismas (y su id)', ap.celdas[2].contenido === 'SELECT mes FROM ventas_mes' && ap.celdas[2].id === 'c' && ap.celdas[0] === celdas[0] && ap.celdas[1] === celdas[1]);
    const nueva = { action: 'propose_change', objetivo: { tipo: 'celda', accion: 'despues_de', n: 2, celdaTipo: 'texto' }, original: celdas[1].contenido, anclaNombre: 'ventas_mes', contenido: 'La venta crece.' };
    const ins = cu.aplicarACeldas(celdas, nueva, () => 'nueva');
    bien('una celda nueva entra después de su vecina', ins.celdas.length === 4 && ins.celdas[2].id === 'nueva' && ins.celdas[2].tipo === 'texto' && ins.celdas[3].id === 'c');
    const arriba = cu.aplicarACeldas(celdas, { ...nueva, objetivo: { ...nueva.objetivo, n: 0, celdaTipo: 'sql', nombre: 'top' }, original: null, anclaNombre: null }, () => 'n0');
    bien('after_cell 0: arriba del todo, con su nombre', arriba.celdas[0].id === 'n0' && arriba.celdas[0].nombre === 'top');
    bien('describir', cu.describirCelda(cambio) === 'Change to cell 3' && cu.describirCelda(nueva) === 'New text cell after cell 2 (ventas_mes)');
    // El estado en el panel: se lee el archivo del notebook.
    const texto = escribirCuaderno({ meta: {}, celdas });
    const tc = { toolCallId: 'c1', toolName: 'propose_change', estado: 'propuesta', result: cambio };
    bien('estado: pendiente sobre el archivo de ahora', prop.estadoDe(tc, texto) === 'propuesta');
    bien('estado: caducada si esa celda cambió', prop.estadoDe(tc, escribirCuaderno({ meta: {}, celdas: [celdas[0], celdas[1], { ...celdas[2], contenido: 'SELECT 2' }] })) === 'caducada');
    bien('estado: sigue pendiente si cambió OTRA celda', prop.estadoDe(tc, escribirCuaderno({ meta: {}, celdas: [{ ...celdas[0], contenido: '# Otro título' }, celdas[1], celdas[2]] })) === 'propuesta');
    bien('leerCuaderno ida y vuelta sigue igual', leerCuaderno(texto).celdas.length === 3);
}

console.log('\nE3 · la sección de Markdown');
{
    const arch = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/archivos/index.js')).href);
    const md = '# Informe\nintro\n## Ventas\nsubieron\n\n```\n# no es un título\n```\n## Costos\nbajaron';
    bien('la sección del cursor, hasta el siguiente encabezado de su nivel', JSON.stringify(arch.seccionEn(md, 4)) === '{"desde":3,"hasta":8,"titulo":"Ventas"}');
    bien('un # dentro de un bloque de código no es título', arch.seccionEn(md, 7).titulo === 'Ventas');
    bien('el título de nivel 1 abarca todo', arch.seccionEn(md, 2).hasta === 10);
    bien('el foco de Markdown trae la sección', arch.focoDeEditor({ texto: md, tipo: 'markdown', lineaCursor: 10 }).seccion?.titulo === 'Costos');
    bien('Markdown va por líneas', arch.porLineas('markdown') && !arch.porLineas('cuaderno'));
    const inicio = arch.inicioDe({ type: 'sqlnb', path: 'a.sqlnb', content: '', resultsError: 'boom', foco: { celda: { n: 2 } } });
    bien('inicio del notebook con la celda en error: arreglarla primero', inicio[0].etiqueta === 'Fix this cell' && inicio.some(o => o.etiqueta === 'Explain this cell'));
}

console.log('\nE3 · el notebook en el servidor');
{
    const { conocido } = require(path.join(RAIZ, 'server/ai/archivoActivo.js'));
    const estructura = {
        parametros: { region: 'Sur' }, vivas: ['ventas_mes'],
        celdas: [
            { n: 1, tipo: 'texto', nombre: null, texto: '# Ventas' },
            { n: 2, tipo: 'sql', nombre: 'ventas_mes', texto: "SELECT mes, sum(importe) AS venta FROM ventas WHERE region = '{{region}}' GROUP BY 1", lee: ['ventas'], estado: 'corrio', filas: 12 },
            { n: 3, tipo: 'sql', nombre: 'crecimiento', texto: 'SELECT mes, venta / lag(venta) - 1 FROM ventas_mes', lee: ['ventas_mes'], estado: 'error' },
        ],
    };
    const a = prepararArchivo({ filePath: 'ventas.sqlnb', fileType: 'sqlnb', contenido: '(el markdown)', estructura });
    bien('el notebook va por celdas numeradas, con nombre, qué lee y cómo corrió', a.porCeldas && !a.porLineas && a.contenido.includes('### Cell 2 · SQL `ventas_mes` (reads: ventas · ran, 12 rows)')
        && a.contenido.includes('last run FAILED') && a.contenido.includes('region = "Sur"') && a.contenido.includes('Live views in the session'));
    bien('sin estructura (un cliente viejo), como antes', !prepararArchivo({ filePath: 'v.sqlnb', fileType: 'sqlnb', contenido: 'x' }).porCeldas);
    const o = politica.sanearOpciones({ mode: 'assistant', filePath: 'ventas.sqlnb', fileType: 'sqlnb', currentQuery: '(md)', foco: { celda: { n: 3 }, cuaderno: estructura }, resultsError: 'Binder Error: lag needs OVER' }, 'ollama');
    bien('el foco: la celda 3, con su nombre', o.enfoque?.celda?.n === 3 && o.enfoque.celda.nombre === 'crecimiento' && o.enfoque.error.includes('lag'));
    const p = buildSystemPrompt({ ...o, modelProfile: { tier: 'high' } });
    bien('el prompt: por celdas, la celda activa y su error', p.includes('Active notebook (ventas.sqlnb), cell by cell') && p.includes('**Where the user is:** cell 3 (SQL `crecimiento`)') && p.includes('The last run failed'));
    bien('el prompt: propone celda a celda, nunca el cuaderno entero', p.includes('proposes ONE cell change') && p.includes('FROM <its name>') && !p.includes('**write_file**: proposes'));
    const md = politica.sanearOpciones({ mode: 'assistant', filePath: 'informe.md', fileType: 'md', currentQuery: '# A\nx\n## B\ny', foco: { seccion: { desde: 3, hasta: 4, titulo: 'B' } } }, 'ollama');
    bien('Markdown: la sección donde está', buildSystemPrompt({ ...md, modelProfile: { tier: 'high' } }).includes('the section "B" at lines 3–4'));
    bien('M3: RULES.md, el glosario y una skill se reconocen', /rules for AmoxSQL's AI/.test(conocido('RULES.md')) && /glossary/.test(conocido('context/glossary.md')) && /skill of AmoxSQL/.test(conocido('agent/skills/eda/SKILL.md')));

    const t = createTools({ dbManager: null, queryResults: new Map(), projectPath: P, mode: 'assistant', archivo: a });
    bien('notebook: propose_change sí, write_file no', !!t.propose_change && !t.write_file);
    const pc = (args) => t.propose_change.execute({ summary: '', ...args }, {});
    const c = await pc({ target: { kind: 'cell', cell: 3 }, new_text: '```sql\nSELECT mes, venta / lag(venta) OVER (ORDER BY mes) - 1 FROM ventas_mes\n```' });
    bien('cambiar la celda 3: su nombre, su texto y sin cercas', c.objetivo?.tipo === 'celda' && c.objetivo.accion === 'cambiar' && c.anclaNombre === 'crecimiento' && c.original.startsWith('SELECT mes, venta / lag') && !c.contenido.includes('```'));
    bien('una celda que no existe: error con la lista', /no cell 9/.test((await pc({ target: { kind: 'cell', cell: 9 }, new_text: 'x' })).error || ''));
    bien('sin cambios: error', /nothing to change/.test((await pc({ target: { kind: 'cell', cell: 1 }, new_text: '# Ventas' })).error || ''));
    const n = await pc({ target: { kind: 'new_cell', after_cell: 3, cell_type: 'text' }, new_text: 'El crecimiento se frena en agosto.' });
    bien('una celda de texto nueva después de la 3', n.objetivo?.accion === 'despues_de' && n.objetivo.n === 3 && n.objetivo.celdaTipo === 'texto' && n.anclaNombre === 'crecimiento');
    bien('nombre repetido: error', /already a cell named/.test((await pc({ target: { kind: 'new_cell', after_cell: 0, cell_type: 'sql', name: 'ventas_mes' }, new_text: 'SELECT 1' })).error || ''));
    bien('nombre inválido: error', /not a valid cell name/.test((await pc({ target: { kind: 'new_cell', after_cell: 0, cell_type: 'sql', name: 'mi celda' }, new_text: 'SELECT 1' })).error || ''));
    bien('after_cell fuera: error', /after_cell must be 0–3/.test((await pc({ target: { kind: 'new_cell', after_cell: 7, cell_type: 'text' }, new_text: 'x' })).error || ''));
    const cu = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/archivos/cuaderno.js')).href);
    const celdasCliente = estructura.celdas.map(x => ({ id: `id${x.n}`, tipo: x.tipo, nombre: x.nombre || '', contenido: x.texto }));
    const ap = cu.aplicarACeldas(celdasCliente, c, () => 'z');
    bien('lo que propone el servidor lo aplica el cliente', ap.celdas[2].contenido.includes('OVER (ORDER BY mes)') && ap.celdas[2].id === 'id3');
}

// ── E4. Report Flow por láminas y el gráfico por paneles ───────────────────
const DECK = `---
title: Ventas Q3
section: Q3 2026
---

<!-- layout: cover -->
# Ventas Q3

---

<!-- layout: finding -->
## Sur crece

El Sur sube.

\`\`\`amoxchart
src: charts/v.amoxvis
\`\`\`

\`\`\`notes
Decir el número.
\`\`\`

---

<!-- layout: content -->
<!-- eyebrow: Anexo -->
## Método

Ventas netas.
`;
fs.mkdirSync(path.join(P, 'charts'), { recursive: true });
fs.writeFileSync(path.join(P, 'charts', 'v.amoxvis'), JSON.stringify({ $schema: 'https://vega.github.io/schema/vega-lite/v6.json', mark: 'bar', usermeta: { amoxsql: { version: 2, modo: 'interfaz', consulta: 'SELECT region, sum(v) AS venta FROM ventas GROUP BY 1', interfaz: { chartType: 'bar', xAxisKey: 'region', yAxisKeys: ['venta'] } } } }));

console.log('\nE4 · el deck por láminas (cliente)');
const dk = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/archivos/deck.js')).href);
const { parseDeck } = await import(pathToFileURL(path.join(RAIZ, 'client/src/utils/deckParser.js')).href);
{
    const deck = parseDeck(DECK);
    const est = dk.estructuraDeDeck(deck);
    bien('la estructura: número, diseño, texto, gráficos, notas', est.laminas.length === 3 && est.laminas[1].diseno === 'finding' && est.laminas[1].graficos[0] === 'charts/v.amoxvis'
        && est.laminas[1].notas === 'Decir el número.' && !est.laminas[1].prosa.includes('amoxchart') && est.disenos.includes('chart-full'), JSON.stringify(est.laminas[1]));
    const cambio = { action: 'propose_change', objetivo: { tipo: 'lamina', accion: 'cambiar', n: 2 }, original: deck.slides[1].raw, lamina: { prosa: '## El Sur crece un 18%\n\nY arrastra al resto.' } };
    const ap = dk.aplicarALaminas(DECK, cambio);
    const despues = parseDeck(ap.texto || '');
    bien('cambiar el texto: el gráfico y las notas se quedan', !ap.error && despues.slides[1].markdown.includes('18%') && despues.slides[1].markdown.includes('src: charts/v.amoxvis') && despues.slides[1].markdown.includes('Decir el número.'), ap.error);
    bien('las demás láminas y la cabecera, byte a byte', despues.slides[0].raw === deck.slides[0].raw && despues.slides[2].raw === deck.slides[2].raw && despues.frontMatterText === deck.frontMatterText);
    const diseno = dk.aplicarALaminas(DECK, { ...cambio, objetivo: { ...cambio.objetivo, n: 3 }, original: deck.slides[2].raw, lamina: { diseno: 'statement' } });
    bien('cambiar el diseño conserva el antetítulo (una directiva que el modelo no ve)', parseDeck(diseno.texto).slides[2].layout === 'statement' && parseDeck(diseno.texto).slides[2].eyebrow === 'Anexo');
    const nueva = { action: 'propose_change', objetivo: { tipo: 'lamina', accion: 'despues_de', n: 1 }, original: deck.slides[0].raw, lamina: { diseno: 'statement', prosa: '## Una sola idea' } };
    const ins = dk.aplicarALaminas(DECK, nueva);
    bien('una lámina nueva entra después de su vecina', parseDeck(ins.texto).slides.length === 4 && parseDeck(ins.texto).slides[1].layout === 'statement' && ins.donde.indice === 1);
    const movido = parseDeck(DECK).slides;
    const reordenado = [movido[1], movido[0], movido[2]].map(s => s.raw).join('\n\n---\n\n');
    bien('la lámina se movió: se encuentra por su crudo', dk.ubicarLamina(parseDeck(reordenado).slides, cambio)?.indice === 0);
    const tocada = DECK.replace('El Sur sube.', 'El Sur sube mucho.');
    bien('su texto cambió: caducada', dk.ubicarLamina(parseDeck(tocada).slides, cambio) === null);
    const tc = { toolCallId: 'l1', toolName: 'propose_change', estado: 'propuesta', result: cambio };
    bien('estado: pendiente / caducada / pendiente si cambió OTRA lámina', prop.estadoDe(tc, DECK) === 'propuesta' && prop.estadoDe(tc, tocada) === 'caducada'
        && prop.estadoDe(tc, DECK.replace('Ventas netas.', 'Ventas brutas.')) === 'propuesta');
    bien('un texto que partiría la lámina no se aplica', !!dk.aplicarALaminas(DECK, { ...cambio, lamina: { prosa: '## A\n\n---\n\n## B' } }).error);
    bien('describir y la lista de cambios', dk.describirLamina(cambio) === 'Change to slide 2' && dk.describirLamina(nueva) === 'New slide after slide 1'
        && dk.cambiosDeLamina(deck.slides[2], { lamina: { diseno: 'statement', notas: 'x' } }).join('|') === 'Layout: content → statement|Speaker notes');
    const lp = dk.laminaPropuesta(DECK, nueva);
    bien('la lámina propuesta, leída como la lee el Studio', lp?.layout === 'statement' && lp.markdown.includes('Una sola idea'));
}

console.log('\nE4 · el deck en el servidor');
{
    const estructura = { ...dk.estructuraDeDeck(parseDeck(DECK)), graficos: { 'charts/v.amoxvis': { tipo: 'bar', titulo: 'Ventas por región', x: 'region', y: ['venta'], consulta: 'SELECT region, sum(v) AS venta FROM ventas GROUP BY 1' } } };
    const a = prepararArchivo({ filePath: 'ventas.amoxdeck', fileType: 'amoxdeck', contenido: DECK, estructura });
    bien('el deck va por láminas: diseño, gráficos con lo que muestran, consultas', a.porLaminas && !a.porLineas && a.puedeProponer
        && a.contenido.includes('### Slide 2 · layout finding · charts: charts/v.amoxvis (bar chart, "Ventas por región", x: region, y: venta)')
        && a.contenido.includes('Layouts available:') && a.contenido.includes('Queries of the charts'), a.contenido.slice(0, 400));
    const o = politica.sanearOpciones({ mode: 'assistant', filePath: 'ventas.amoxdeck', fileType: 'amoxdeck', currentQuery: DECK, foco: { lamina: { n: 2 }, deck: estructura } }, 'ollama');
    bien('el foco: la lámina 2', o.enfoque?.lamina?.n === 2 && o.enfoque.lamina.diseno === 'finding');
    const p = buildSystemPrompt({ ...o, modelProfile: { tier: 'high' } });
    bien('el prompt: lámina por lámina, la activa, y propone por láminas', p.includes('Active deck (ventas.amoxdeck), slide by slide') && p.includes('**Where the user is:** slide 2 (layout finding')
        && p.includes('proposes ONE slide change') && !p.includes('**write_file**: proposes'));
    const t = createTools({ dbManager: null, queryResults: new Map(), projectPath: P, mode: 'assistant', archivo: a });
    bien('deck: propose_change sí, write_file no', !!t.propose_change && !t.write_file);
    const pc = (args) => t.propose_change.execute({ summary: '', ...args }, {});
    const c = await pc({ target: { kind: 'slide', slide: 2 }, text: '## El Sur crece un 18%\n\nY arrastra al resto.' });
    bien('cambiar la lámina 2: su texto y su crudo de ahora', c.objetivo?.tipo === 'lamina' && c.objetivo.n === 2 && c.lamina.prosa.includes('18%') && c.original.includes('src: charts/v.amoxvis') && c.lamina.graficos === undefined, JSON.stringify(c));
    bien('un diseño que no existe: error con la lista', /not a layout/.test((await pc({ target: { kind: 'slide', slide: 2 }, layout: 'hero' })).error || ''));
    bien('un gráfico que no existe: error', /do not exist/.test((await pc({ target: { kind: 'slide', slide: 2 }, charts: ['charts/nada.amoxvis'] })).error || ''));
    bien('un --- en el texto: error', /splits the slide/.test((await pc({ target: { kind: 'slide', slide: 2 }, text: '## A\n---\n## B' })).error || ''));
    bien('un bloque amoxchart en el texto: error', /Put charts in/.test((await pc({ target: { kind: 'slide', slide: 2 }, text: '## A\n```amoxchart\nsrc: x\n```' })).error || ''));
    bien('sin cambios: error', /nothing to change/.test((await pc({ target: { kind: 'slide', slide: 2 }, layout: 'finding' })).error || ''));
    bien('una lámina que no existe: error', /no slide 9/.test((await pc({ target: { kind: 'slide', slide: 9 }, text: 'x' })).error || ''));
    const n = await pc({ target: { kind: 'new_slide', after_slide: 3 }, layout: 'actions', text: '## Qué proponemos', charts: ['charts/v.amoxvis'] });
    bien('una lámina nueva al final, con un gráfico que existe', n.objetivo?.accion === 'despues_de' && n.objetivo.n === 3 && n.lamina.diseno === 'actions' && n.lamina.graficos[0] === 'charts/v.amoxvis', JSON.stringify(n));
    const ap = dk.aplicarALaminas(DECK, c);
    bien('lo que propone el servidor lo aplica el cliente', parseDeck(ap.texto).slides[1].markdown.includes('18%') && parseDeck(ap.texto).slides[1].markdown.includes('src: charts/v.amoxvis'));
    // Un modelo local de 2B mandó `target: "4"` (visto en la app): se acepta.
    const esq = t.propose_change.inputSchema;
    bien('objetivo como número suelto, sin kind o con números como texto: se entiende', esq.parse({ target: '4', text: 'x' }).target.slide === 4
        && esq.parse({ target: { after_slide: '2' }, text: 'x' }).target.kind === 'new_slide' && esq.parse({ target: { slide: 3 } }).target.kind === 'slide');
    const tcu = createTools({ dbManager: null, queryResults: new Map(), projectPath: P, mode: 'assistant', archivo: prepararArchivo({ filePath: 'v.sqlnb', fileType: 'sqlnb', contenido: 'x', estructura: { celdas: [{ n: 1, tipo: 'sql', texto: 'SELECT 1' }] } }) });
    bien('…y en el notebook (celda «2» → { kind: cell, cell: 2 })', tcu.propose_change.inputSchema.parse({ target: '2', new_text: 'x' }).target.kind === 'cell');
    bien('sin estructura (un cliente viejo), el deck sigue con write_file', !!createTools({ dbManager: null, queryResults: new Map(), projectPath: P, mode: 'assistant', archivo: prepararArchivo({ filePath: 'd.amoxdeck', fileType: 'amoxdeck', contenido: DECK }) }).write_file);
}

console.log('\nE4 · el gráfico por paneles (cliente)');
const gr = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/archivos/grafico.js')).href);
const { escribirAmoxvis } = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/DataVisualizer/vega/figura.js')).href);
const CONFIG = { chartType: 'bar', xAxisKey: 'region', yAxisKeys: ['venta'], chartTitle: 'Ventas', query: 'SELECT region, venta, mes FROM v' };
const COLS = [{ name: 'region', type: 'VARCHAR' }, { name: 'venta', type: 'DOUBLE' }, { name: 'mes', type: 'DATE' }];
{
    const est = gr.estructuraDeGrafico({ config: CONFIG, columnas: COLS, etapa: 'story' });
    bien('la estructura: paneles elegidos, columnas, etapa; sin filas', est.paneles.xAxisKey === 'region' && est.paneles.chartTitle === 'Ventas' && !('chartType' in est.paneles)
        && est.columnas[2].type === 'DATE' && est.etapa === 'story' && est.tipos.includes('line') && !est.tipos.includes('bar-stacked') && est.claves.highlightConfig === 'object' && !('data' in est));
    bien('la tabla de capacidades: el resalte no se dibuja en un donut', est.admite.resalte.includes('bar') && !est.admite.resalte.includes('donut'));
    const v1 = gr.validarCambios(CONFIG, { chartType: 'bar-stacked', sortMode: 'y-desc' }, COLS);
    bien('un tipo compuesto pasa a tipo + apilado', v1.cambios.chartType === 'bar' && v1.cambios.barStackMode === 'stack' && !v1.errores.length);
    bien('una columna que no está: error', gr.validarCambios(CONFIG, { xAxisKey: 'pais' }, COLS).errores.some(e => /pais is not a column/.test(e)));
    bien('un panel que el tipo no dibuja: error', gr.validarCambios(CONFIG, { chartType: 'donut', highlightConfig: { type: 'max' } }, COLS).errores.some(e => /does not draw highlightConfig/.test(e)));
    bien('apagar un panel que no se dibuja sí vale', !gr.validarCambios({ ...CONFIG, chartType: 'donut' }, { highlightConfig: { type: 'none' } }, COLS).errores.length);
    bien('un valor del tipo equivocado y una clave que no existe: error', gr.validarCambios(CONFIG, { limit: '10', color: 'red' }, COLS).errores.length === 2);
    const mezcla = gr.aplicarCambios(CONFIG, { highlightConfig: { type: 'exact', value: 'Sur' } });
    bien('un objeto se mezcla con el de hoy (conserva su color)', mezcla.highlightConfig.type === 'exact' && mezcla.highlightConfig.value === 'Sur' && !!mezcla.highlightConfig.color);
    const r = { action: 'propose_change', objetivo: { tipo: 'paneles' }, cambios: { chartType: 'line', takeaway: 'El Sur lidera' }, original: { chartType: 'bar', takeaway: '' } };
    bien('vigente si esos paneles siguen igual; caduca si alguien tocó uno', gr.vigenteEnGrafico(CONFIG, r) && !gr.vigenteEnGrafico({ ...CONFIG, takeaway: 'otra' }, r) && gr.vigenteEnGrafico({ ...CONFIG, chartTitle: 'Otro' }, r));
    const texto = JSON.stringify(escribirAmoxvis(CONFIG));
    const tc = { toolCallId: 'g1', toolName: 'propose_change', estado: 'propuesta', result: r };
    bien('estado sobre el archivo .amoxvis', prop.estadoDe(tc, texto) === 'propuesta' && prop.estadoDe(tc, JSON.stringify(escribirAmoxvis({ ...CONFIG, chartType: 'area' }))) === 'caducada');
    bien('la lista de lo que cambia', gr.describirCambios(r).join(' | ') === 'Type: “bar” → “line” | Takeaway: — → “El Sur lidera”', gr.describirCambios(r).join(' | '));
    bien('la línea del chat', gr.describirGrafico(r) === 'Change to the chart: Type, Takeaway');
    const arch = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/archivos/index.js')).href);
    bien('el inicio del gráfico, con la pregunta de la etapa', arch.inicioDe({ type: 'amoxvis', path: 'v.amoxvis', content: '{}', foco: { grafico: { etapa: 'story' } } })[0]?.etiqueta === 'Write the takeaway');
    bien('el inicio del deck, con la lámina', arch.inicioDe({ type: 'amoxdeck', path: 'd.amoxdeck', content: DECK, foco: { lamina: { n: 2 } } })[0]?.etiqueta === 'Tighten this slide');
}

console.log('\nE4 · el gráfico en el servidor');
{
    const estructura = gr.estructuraDeGrafico({ config: CONFIG, columnas: COLS, etapa: 'type' });
    const a = prepararArchivo({ filePath: 'charts/v.amoxvis', fileType: 'amoxvis', contenido: '{"mark":"bar"}', estructura });
    bien('el gráfico va por paneles y SÍ propone', a.porPaneles && a.puedeProponer && a.contenido.includes('Chart type: bar') && a.contenido.includes('region (VARCHAR)') && a.contenido.includes('"chartTitle": "Ventas"'));
    bien('sin estructura, un gráfico no propone (como antes)', !prepararArchivo({ filePath: 'v.amoxvis', fileType: 'amoxvis', contenido: '{}' }).puedeProponer);
    const o = politica.sanearOpciones({ mode: 'assistant', filePath: 'charts/v.amoxvis', fileType: 'amoxvis', currentQuery: '{}', foco: { grafico: estructura } }, 'ollama');
    const p = buildSystemPrompt({ ...o, modelProfile: { tier: 'high' } });
    bien('el prompt: el gráfico por sus paneles y la etapa', p.includes('Active chart (charts/v.amoxvis)') && p.includes('the type stage of Story Flow') && p.includes('Never write the .amoxvis JSON by hand'));
    const t = createTools({ dbManager: null, queryResults: new Map(), projectPath: P, mode: 'assistant', archivo: a });
    bien('gráfico: propose_change sí, write_file no', !!t.propose_change && !t.write_file);
    const pc = (args) => t.propose_change.execute({ summary: '', ...args }, {});
    const c = await pc({ target: { kind: 'panels', changes: { chartType: 'bar-horizontal', sortMode: 'y-desc', highlightConfig: { type: 'max' } } } });
    bien('paneles: los cambios y lo que había', c.objetivo?.tipo === 'paneles' && c.cambios.chartType === 'bar-horizontal' && c.original.chartType === 'bar' && c.original.sortMode === 'x-asc', JSON.stringify(c));
    bien('una columna que no está: error', /pais is not a column/.test((await pc({ target: { kind: 'panels', changes: { xAxisKey: 'pais' } } })).error || ''));
    bien('un donut no dibuja resaltes: error', /does not draw highlightConfig/.test((await pc({ target: { kind: 'panels', changes: { chartType: 'donut', highlightConfig: { type: 'max' } } } })).error || ''));
    bien('sin cambios: error', /nothing to change/.test((await pc({ target: { kind: 'panels', changes: { chartType: 'bar' } } })).error || ''));
    bien('un spec fuera de la vista Code: error', /only proposed in the Code view/.test((await pc({ target: { kind: 'spec', vega_lite: { mark: 'line' } } })).error || ''));
    const ac = prepararArchivo({ filePath: 'charts/v.amoxvis', fileType: 'amoxvis', contenido: '{}', estructura: { ...estructura, vista: 'codigo' } });
    const tc2 = createTools({ dbManager: null, queryResults: new Map(), projectPath: P, mode: 'assistant', archivo: ac });
    const sp = await tc2.propose_change.execute({ summary: '', target: { kind: 'spec', vega_lite: { mark: 'line', encoding: { x: { field: 'mes', type: 'temporal' }, y: { field: 'venta', type: 'quantitative' } } } } }, {});
    bien('en la vista Code, un spec que compila', sp.objetivo?.tipo === 'spec' && sp.spec.data.name === 'dataset', JSON.stringify(sp).slice(0, 200));
    bien('un spec con un campo que no está: error', /not in the result: pais/.test((await tc2.propose_change.execute({ summary: '', target: { kind: 'spec', vega_lite: { mark: 'bar', encoding: { x: { field: 'pais', type: 'nominal' } } } } }, {})).error || ''));
    bien('gráfico: un objetivo sin kind con claves de Story Flow son cambios de paneles', t.propose_change.inputSchema.parse({ target: { chartType: 'line' } }).target.changes.chartType === 'line');
    const v = gr.validarCambios(CONFIG, c.cambios, COLS);
    bien('lo que propone el servidor lo valida igual el cliente', !v.errores.length && gr.aplicarCambios(CONFIG, v.cambios).highlightConfig.type === 'max');
}

// ── E5. Data Flow por pasos, Canvas por tarjetas, el diagrama como grafo ───
console.log('\nE5 · Data Flow por pasos');
const fl = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/archivos/flujo.js')).href);
{
    const FLUJO = { name: 'Ventas', nodes: [
        { id: 'imp', type: 'import_file', label: 'Import', position: { x: 100, y: 80 }, config: { sourcePath: 'v.csv', tableName: 'v' } },
        { id: 'fil', type: 'filter', label: 'Solo Sur', position: { x: 400, y: 80 }, config: { tableName: 'v_sur', conditions: [{ column: 'region', operator: '=', value: 'Sur' }] } },
        { id: 'exp', type: 'export_file', label: 'Export', position: { x: 700, y: 80 }, config: { outputPath: 'out.csv', format: 'csv' } },
    ], edges: [{ id: 'e1', source: 'imp', target: 'fil' }, { id: 'e2', source: 'fil', target: 'exp' }] };
    const texto = JSON.stringify(FLUJO);
    const a = prepararArchivo({ filePath: 'flujos/v.sqlchain', fileType: 'sqlchain', contenido: texto, estructura: { estados: { fil: 'failed' } } });
    bien('el flujo va por pasos, en orden, con lo que lee cada uno y sin posiciones', a.porPasos && a.puedeProponer && a.contenido.indexOf('`imp`') < a.contenido.indexOf('`fil`')
        && a.contenido.includes('reads: imp · last run FAILED') && !a.contenido.includes('position'), a.contenido.slice(0, 300));
    const o = politica.sanearOpciones({ mode: 'assistant', filePath: 'flujos/v.sqlchain', fileType: 'sqlchain', currentQuery: texto, foco: { paso: { id: 'fil' }, flujo: { estados: { fil: 'failed' } } }, resultsError: "Binder Error: column 'region' not found" }, 'ollama');
    const p = buildSystemPrompt({ ...o, modelProfile: { tier: 'high' } });
    bien('el prompt: el flujo paso a paso, el paso seleccionado, su error y el catálogo de pasos', p.includes('Active Data Flow, step by step') && p.includes('**Where the user is:** step `fil` (filter')
        && p.includes('The last run failed') && p.includes('group_aggregate') && !p.includes('**write_file**: proposes'));
    const t = createTools({ dbManager: null, queryResults: new Map(), projectPath: P, mode: 'assistant', archivo: a });
    bien('Data Flow: propose_change sí, write_file no', !!t.propose_change && !t.write_file);
    const pc = (args) => t.propose_change.execute({ summary: '', ...args }, {});
    const c = await pc({ add: [{ id: 'dedup', type: 'deduplicate', label: 'Dedup', config: { tableName: 'v_unica', keyColumns: ['id'] }, after: ['fil'] }],
        connect: [{ from: 'dedup', to: 'exp' }], disconnect: [{ from: 'fil', to: 'exp' }], change: [{ id: 'exp', config: { format: 'parquet' } }] });
    bien('añadir, conectar, desconectar y cambiar: el flujo que quedaría y la lista de cambios', c.objetivo?.tipo === 'pasos' && c.despues.nodes.length === 4
        && c.despues.edges.some(e => e.source === 'dedup' && e.target === 'exp') && !c.despues.edges.some(e => e.source === 'fil' && e.target === 'exp')
        && c.despues.nodes.find(n => n.id === 'exp').config.format === 'parquet' && c.despues.nodes.find(n => n.id === 'exp').config.outputPath === 'out.csv'
        && c.cambios.some(l => /Added step «Dedup»/.test(l)) && c.cambios.some(l => /Disconnected/.test(l)) && !JSON.stringify(c.despues).includes('position'), JSON.stringify(c).slice(0, 300));
    bien('un ciclo: error', /cycle/.test((await pc({ connect: [{ from: 'exp', to: 'imp' }] })).error || ''));
    bien('un tipo de paso que no existe: error con la lista', /not a step type/.test((await pc({ add: [{ id: 'x', type: 'magia' }] })).error || ''));
    bien('un id que ya existe: error', /already a step "fil"/.test((await pc({ add: [{ id: 'fil', type: 'filter' }] })).error || ''));
    bien('quitar uno que no existe: error', /no step "nada"/.test((await pc({ remove: ['nada'] })).error || ''));
    bien('sin cambios: error', /nothing to change/.test((await pc({ change: [{ id: 'exp', config: { format: 'csv' } }] })).error || ''));
    const q = await pc({ remove: ['fil'], connect: [{ from: 'imp', to: 'exp' }] });
    bien('quitar un paso se lleva sus conexiones', !q.despues.nodes.some(n => n.id === 'fil') && q.despues.edges.length === 1 && q.original.nodos.fil);

    // El cliente: vigente, clasificar, fundir y colocar.
    const def = { nodes: FLUJO.nodes.map(({ position, ...n }) => n), edges: FLUJO.edges };
    bien('vigente sobre el flujo de hoy', fl.vigenteEnFlujo(def, c));
    const tocado = { ...def, nodes: def.nodes.map(n => (n.id === 'exp' ? { ...n, config: { ...n.config, outputPath: 'otro.csv' } } : n)) };
    bien('caduca si alguien cambió un paso que toca', !fl.vigenteEnFlujo(tocado, c));
    bien('sigue vigente si cambió otro paso', fl.vigenteEnFlujo({ ...def, nodes: def.nodes.map(n => (n.id === 'imp' ? { ...n, label: 'Otro' } : n)) }, c));
    const cl = fl.clasificar(def, c);
    bien('clasificar: nuevos, cambiados y conexiones', cl.nuevos.has('dedup') && cl.cambiados.has('exp') && !cl.cambiados.has('imp') && cl.aristasNuevas.length === 2 && cl.aristasQuitadas.length === 1);
    const conOtro = { nodes: [...def.nodes, { id: 'mio', type: 'sample', label: 'Mío', config: {} }], edges: [...def.edges, { id: 'e9', source: 'imp', target: 'mio' }] };
    const fu = fl.fundirPasos(conOtro, c);
    bien('fundir: lo que el usuario añadió después se queda', fu.nodes.some(n => n.id === 'mio') && fu.edges.some(e => e.target === 'mio') && fu.nodes.some(n => n.id === 'dedup')
        && fu.nodes.find(n => n.id === 'exp').config.format === 'parquet');
    const pos = fl.posicionesNuevas(c, new Map(FLUJO.nodes.map(n => [n.id, n.position])), cl.nuevos);
    bien('el paso nuevo, a la derecha del que lee y sin tapar al que ya estaba ahí', pos.get('dedup').x === 700 && pos.get('dedup').y === 220, JSON.stringify([...pos]));
    const tcf = { toolCallId: 'f1', toolName: 'propose_change', estado: 'propuesta', result: c };
    bien('estado sobre el .sqlchain', prop.estadoDe(tcf, texto) === 'propuesta' && prop.estadoDe(tcf, JSON.stringify(tocado)) === 'caducada');
}

console.log('\nE5 · el Canvas por tarjetas');
const lz = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/archivos/lienzo.js')).href);
const { leerLienzo, escribirLienzo } = await import(pathToFileURL(path.join(RAIZ, 'client/src/utils/lienzoFile.js')).href);
{
    const LIENZO = { titulo: 'Ventas', tarjetas: [
        { id: 'ventas_src', tipo: 'source', origen: { tipo: 'tabla', nombre: 'ventas' }, x: 0, y: 0, w: 260, h: 170, foto: { cuando: '2026-11-01', filas: 3, columnas: ['region', 'importe'], muestra: [['Sur', 10]] } },
        { id: 'por_region', tipo: 'query', sql: 'SELECT region, sum(importe) AS venta FROM ventas_src GROUP BY 1', x: 320, y: 0, w: 380, h: 300 },
        { id: 'nota_1', tipo: 'note', texto: 'Revisar el Sur', x: 0, y: 400, w: 190, h: 120 },
    ] };
    const est = lz.estructuraDeLienzo(LIENZO, { flechas: [{ de: 'ventas_src', a: 'por_region' }] });
    bien('la estructura: lo que lee cada tarjeta, sin fotos', est.tarjetas[1].lee[0] === 'ventas_src' && !JSON.stringify(est).includes('muestra') && est.tarjetas[0].origen === 'the table ventas');
    const a = prepararArchivo({ filePath: 'c.amoxcanvas', fileType: 'amoxcanvas', contenido: JSON.stringify(LIENZO), estructura: est });
    bien('el Canvas va por tarjetas, sin fotos', a.porTarjetas && a.puedeProponer && a.contenido.includes('### Card `por_region` · query (reads: ventas_src)') && !a.contenido.includes('Sur", 10'));
    const o = politica.sanearOpciones({ mode: 'assistant', filePath: 'c.amoxcanvas', fileType: 'amoxcanvas', currentQuery: JSON.stringify(LIENZO), foco: { tarjeta: { id: 'por_region' }, lienzo: est } }, 'ollama');
    bien('el foco: la tarjeta seleccionada', buildSystemPrompt({ ...o, modelProfile: { tier: 'high' } }).includes('**Where the user is:** card `por_region` (query)'));
    const t = createTools({ dbManager: null, queryResults: new Map(), projectPath: P, mode: 'assistant', archivo: a });
    const pc = (args) => t.propose_change.execute({ summary: '', ...args }, {});
    const c = await pc({ target: { kind: 'card', card: 'por_region' }, content: '```sql\nSELECT region, sum(importe) AS venta FROM ventas_src GROUP BY 1 ORDER BY 2 DESC\n```' });
    bien('cambiar el SQL de una consulta: sin cercas y con lo que había', c.objetivo?.accion === 'cambiar' && c.objetivo.campo === 'sql' && c.contenido.endsWith('DESC') && c.original.startsWith('SELECT region'));
    bien('una Source no se cambia con texto', /not changed with text/.test((await pc({ target: { kind: 'card', card: 'ventas_src' }, content: 'x' })).error || ''));
    bien('una consulta nueva necesita nombre; un nombre repetido, error', /needs a name/.test((await pc({ target: { kind: 'new_card', card_type: 'query' }, content: 'SELECT 1' })).error || '')
        && /already a card/.test((await pc({ target: { kind: 'new_card', card_type: 'query', name: 'por_region' }, content: 'SELECT 1' })).error || ''));
    const n = await pc({ target: { kind: 'new_card', card_type: 'query', name: 'top_sur', near: 'por_region' }, content: "SELECT * FROM por_region WHERE region = 'Sur'" });
    bien('una consulta nueva junto a otra', n.objetivo?.accion === 'nueva' && n.objetivo.id === 'top_sur' && n.objetivo.cerca === 'por_region');
    const ap = lz.aplicarALienzo(LIENZO, n, { idLibre: (b) => `${b}_9` });
    const nueva = ap.lienzo.tarjetas.find(x => x.id === 'top_sur');
    bien('aplicar: la tarjeta nueva a la derecha de la de al lado; las demás, con su foto', nueva && nueva.x === 320 + 380 + 70 && nueva.y === 0 && ap.lienzo.tarjetas[0].foto);
    const nota = lz.aplicarALienzo(LIENZO, { ...n, objetivo: { tipo: 'tarjeta', accion: 'nueva', id: null, tarjetaTipo: 'note', campo: 'texto', cerca: null }, contenido: 'Ojo' }, { idLibre: (b) => `${b}_9` });
    bien('una nota nueva toma un nombre libre', nota.id === 'nota_9' && nota.lienzo.tarjetas.at(-1).texto === 'Ojo');
    const otro = { ...LIENZO, tarjetas: LIENZO.tarjetas.map(x => (x.id === 'por_region' ? { ...x, sql: 'SELECT 1' } : x)) };
    bien('caduca si la tarjeta cambió; el archivo sigue leyéndose', !lz.vigenteEnLienzo(otro, c) && !!lz.aplicarALienzo(otro, c, {}).error && leerLienzo(escribirLienzo(ap.lienzo)).tarjetas.length === 4);
    const tcl = { toolCallId: 'l9', toolName: 'propose_change', estado: 'propuesta', result: c };
    bien('estado sobre el .amoxcanvas', prop.estadoDe(tcl, escribirLienzo(LIENZO)) === 'propuesta' && prop.estadoDe(tcl, escribirLienzo(otro)) === 'caducada');
}

console.log('\nE5 · el diagrama como grafo');
const dg = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/archivos/diagrama.js')).href);
const { leerDiagrama } = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/diagram/diagramFile.js')).href);
{
    const DIAGRAMA = '---\ntitle: Ventas\n---\n\n```mermaid\nflowchart LR\n  erp[("ERP")] --> lim["Limpiar"]\n  lim --> rep[\\"Reporte"\\]\n  classDef origen fill:#1b3a52,stroke:#4a9fd8\n  class erp origen\n```\n';
    const doc = leerDiagrama(DIAGRAMA);
    const est = dg.estructuraDeDiagrama(doc);
    bien('la estructura: cajas, flechas, formas y capas', est.grafo.nodos.length === 3 && est.capas[0] === 'origen' && est.formas.includes('almacen') && est.estilos.includes('continuo'));
    const a = prepararArchivo({ filePath: 'd.amoxdiagram', fileType: 'amoxdiagram', contenido: DIAGRAMA, estructura: est });
    bien('el diagrama va como grafo', a.porDiagrama && a.puedeProponer && a.contenido.includes('- erp: "ERP" (almacen, layer origen)') && a.contenido.includes('- erp → lim'));
    const t = createTools({ dbManager: null, queryResults: new Map(), projectPath: P, mode: 'assistant', archivo: a });
    const pc = (diagram) => t.propose_change.execute({ summary: '', diagram }, {});
    const base = { direction: 'LR', nodes: [{ id: 'erp', text: 'ERP', shape: 'almacen', layer: 'origen' }, { id: 'lim', text: 'Limpiar' }, { id: 'dup', text: 'Quitar duplicados' }, { id: 'rep', text: 'Reporte', shape: 'salida' }],
        edges: [{ from: 'erp', to: 'lim' }, { from: 'lim', to: 'dup' }, { from: 'dup', to: 'rep', style: 'principal' }] };
    const c = await pc(base);
    bien('el diagrama propuesto, validado', c.objetivo?.tipo === 'diagrama' && c.grafo.nodos.length === 4 && c.original.includes('flowchart LR'), JSON.stringify(c).slice(0, 200));
    bien('una forma que no existe: error', /not a shape/.test((await pc({ ...base, nodes: [...base.nodes, { id: 'z', text: 'Z', shape: 'estrella' }] })).error || ''));
    bien('una flecha a una caja que no existe: error', /does not exist/.test((await pc({ ...base, edges: [{ from: 'erp', to: 'nada' }] })).error || ''));
    bien('una caja en dos grupos: error', /two groups/.test((await pc({ ...base, groups: [{ id: 'g1', nodes: ['erp'] }, { id: 'g2', nodes: ['erp'] }] })).error || ''));
    bien('una capa que no existe: error', /no layer "nube"/.test((await pc({ ...base, nodes: [{ id: 'erp', text: 'ERP', layer: 'nube' }] })).error || ''));
    const ap = dg.aplicarDiagrama(DIAGRAMA, c);
    const nuevo = leerDiagrama(ap.texto || '');
    bien('aplicar: el editor lo vuelve a abrir, con la cabecera y el classDef intactos', !!nuevo.grafo && nuevo.grafo.nodos.length === 4 && ap.texto.startsWith('---\ntitle: Ventas') && ap.texto.includes('classDef origen fill:#1b3a52'));
    const cm = dg.cambiosDeDiagrama(doc.grafo, c);
    bien('lo que cambia: la caja nueva', cm.nuevos[0] === 'dup' && cm.lista.some(l => /New box “Quitar duplicados”/.test(l)));
    const tcd = { toolCallId: 'd1', toolName: 'propose_change', estado: 'propuesta', result: c };
    bien('caduca si el diagrama cambió', prop.estadoDe(tcd, DIAGRAMA) === 'propuesta' && prop.estadoDe(tcd, DIAGRAMA.replace('"Limpiar"', '"Limpiar datos"')) === 'caducada');
    const arch = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/archivos/index.js')).href);
    bien('el inicio: expandir la caja seleccionada; arreglar el paso que falló', arch.inicioDe({ type: 'amoxdiagram', path: 'd.amoxdiagram', content: DIAGRAMA, foco: { nodo: { id: 'lim' } } })[0]?.etiqueta === 'Expand this step'
        && arch.inicioDe({ type: 'sqlchain', path: 'f.sqlchain', content: '{}', resultsError: 'x', foco: { paso: { id: 'a' } } })[0]?.etiqueta === 'Fix this step');
}

// ── E6. El chat, más corto ──────────────────────────────────────────────────
console.log('\nE6 · el trabajo en una línea');
{
    const { resumenDelTrabajo } = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/trabajo.js')).href);
    const llamadas = [
        { toolName: 'execute_sql', result: { rowCount: 3 } },
        { toolName: 'execute_sql', result: { error: 'boom' } },
        { toolName: 'describe_table', result: {} },
        { toolName: 'propose_change', result: { action: 'propose_change', objetivo: { tipo: 'rango', desde: 1, hasta: 1 } } },
        { toolName: 'suggest_followups', result: { suggestions: [] } },
    ];
    bien('consultas, tablas y propuestas, en una línea', resumenDelTrabajo(llamadas) === 'Ran 2 queries (1 failed) · looked at 1 table · proposed 1 change', resumenDelTrabajo(llamadas));
    bien('una sola consulta, en singular; sin trabajo, nada', resumenDelTrabajo([{ toolName: 'execute_sql', result: {} }]) === 'Ran 1 query' && resumenDelTrabajo([]) === '');
    bien('una herramienta que no se nombra cuenta como paso', resumenDelTrabajo([{ toolName: 'create_plan', result: {} }]) === '1 more step');
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
