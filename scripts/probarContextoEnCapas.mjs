/**
 * El contexto en capas (B2), fase 7.1–7.2 del plan de la 5.9.
 *
 *     node scripts/probarContextoEnCapas.mjs
 *
 * Las reglas de fusión —métricas y skills por nombre (gana el proyecto),
 * glosario y RULES.md los dos bajo su título— y los archivos de contexto del
 * workspace por la API: listar, escribir, no salirse de la carpeta, y «subir»
 * una métrica de un proyecto. Todo en un AMOXSQL_HOME temporal.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-capas-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const { loadProjectContext, buildProjectContextSection } = require(path.join(RAIZ, 'server/ai/contextLoader.js'));
const { loadUserRules } = require(path.join(RAIZ, 'server/ai/userRules.js'));
const { loadSkills } = require(path.join(RAIZ, 'server/ai/skills.js'));

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const escribir = (ruta, texto) => { fs.mkdirSync(path.dirname(ruta), { recursive: true }); fs.writeFileSync(ruta, texto); };
const skill = (id, nombre) => `---\nname: ${nombre}\ndescription: ${nombre} skill\nkeywords: [${id}]\n---\n# ${nombre}\nSteps.\n`;

// ── Un workspace con su contexto, y dos proyectos: uno enlazado y otro no ───
const WS = 'ws-tiendas-01';
const DIR_WS = path.join(HOME, 'workspaces', WS);
escribir(path.join(DIR_WS, 'RULES.md'), 'Fiscal year starts in February.');
escribir(path.join(DIR_WS, 'contexto', 'metrics.yml'),
    'metrics:\n  - name: revenue\n    sql: "SUM(total)"\n    description: Revenue as the client defines it\n\n  - name: roas\n    sql: "SUM(revenue) / NULLIF(SUM(ad_spend), 0)"\n    description: Return on ad spend\n');
escribir(path.join(DIR_WS, 'contexto', 'glossary.md'), '- **Tienda**: a physical store.');
escribir(path.join(DIR_WS, 'skills', 'cierre-mensual', 'SKILL.md'), skill('cierre', 'Monthly close'));
escribir(path.join(DIR_WS, 'skills', 'compartido', 'SKILL.md'), skill('compartido', 'From the workspace'));

const P = path.join(TMP, 'ventas-q4');
escribir(path.join(P, '.amoxsql', 'project.json'), JSON.stringify({ name: 'ventas-q4', workspace: { id: WS, nombre: 'Tiendas' } }));
escribir(path.join(P, 'RULES.md'), 'Use the q4 schema.');
escribir(path.join(P, 'context', 'metrics.yml'),
    'metrics:\n  - name: revenue\n    sql: "SUM(total) FILTER (WHERE status = \'paid\')"\n    description: Paid revenue only\n\n  - name: margin\n    sql: "SUM(total - cost)"\n    description: Gross margin\n');
escribir(path.join(P, 'context', 'glossary.md'), '- **Q4**: October to December.');
escribir(path.join(P, 'agent', 'skills', 'compartido', 'SKILL.md'), skill('compartido', 'From the project'));

const SUELTO = path.join(TMP, 'suelto');
escribir(path.join(SUELTO, 'RULES.md'), 'Only mine.');

try {
    console.log('\nmétricas: por nombre, gana el proyecto');
    const ctx = await loadProjectContext(P);
    const por = Object.fromEntries((ctx?.metrics || []).map(m => [m.name, m]));
    comprobar('revenue es la del proyecto', /status = 'paid'/.test(por.revenue?.sql || ''), por.revenue?.sql);
    comprobar('roas llega del workspace, marcada como compartida', por.roas && por.roas.compartida === 'Tiendas', JSON.stringify(por.roas));
    comprobar('margin, sólo del proyecto, sigue ahí', !!por.margin && !por.margin.compartida);
    const seccion = buildProjectContextSection(ctx);
    comprobar('el prompt dice cuál es compartida', /\*\*roas\*\*.*shared — Tiendas/.test(seccion) && !/\*\*revenue\*\*.*shared/.test(seccion));

    console.log('\nglosario y reglas: los dos, cada uno bajo su título');
    comprobar('glosario: el del workspace y el del proyecto', /#### Shared — Tiendas[\s\S]*Tienda[\s\S]*#### This project[\s\S]*Q4/.test(ctx.glossary), ctx.glossary);
    const reglas = await loadUserRules(P);
    comprobar('RULES.md: primero las compartidas, luego las del proyecto',
        /### Shared rules — Tiendas\nFiscal year[\s\S]*### This project's rules\nUse the q4/.test(reglas || ''), reglas);

    console.log('\nskills: de serie < workspace < proyecto');
    const skills = await loadSkills(P);
    const s = Object.fromEntries(skills.map(x => [x.id, x]));
    comprobar('el del workspace está', s['cierre-mensual']?.workspace === 'Tiendas', JSON.stringify(s['cierre-mensual']));
    comprobar('con el mismo id, gana el del proyecto', s.compartido?.name === 'From the project', s.compartido?.name);
    comprobar('y los de serie siguen', skills.some(x => x.builtin));

    console.log('\nuna carpeta sin workspace, como siempre');
    comprobar('sus reglas, sin títulos', (await loadUserRules(SUELTO)) === 'Only mine.');
    comprobar('sin contexto del workspace', (await loadProjectContext(SUELTO)) === null);
    comprobar('sin sus skills', !(await loadSkills(SUELTO)).some(x => x.id === 'cierre-mensual'));

    console.log('\nlos archivos del workspace, por la API');
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 100));
    const u = (p) => `http://localhost:${port}${p}`;
    const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
        .then(async r => ({ status: r.status, ...(await r.json()) }));
    const get = pedir('GET'), put = pedir('PUT'), post = pedir('POST');

    const w = await post('/api/workspaces', { nombre: 'Clínica' });
    let lista = (await get(`/api/workspaces/${w.id}/contexto`)).archivos;
    comprobar('lista los archivos de siempre, aunque aún no existan',
        ['RULES.md', 'contexto/metrics.yml', 'contexto/joins.yml', 'contexto/glossary.md'].every(r => lista.some(a => a.ruta === r && a.existe === false)));
    const esc = await put(`/api/workspaces/${w.id}/contexto/archivo`, { ruta: 'RULES.md', texto: 'Never show patient names.' });
    comprobar('escribir RULES.md', esc.status === 200 && fs.readFileSync(path.join(HOME, 'workspaces', w.id, 'RULES.md'), 'utf8') === 'Never show patient names.');
    comprobar('y leerlo', (await get(`/api/workspaces/${w.id}/contexto/archivo?ruta=RULES.md`)).texto === 'Never show patient names.');
    await put(`/api/workspaces/${w.id}/contexto/archivo`, { ruta: 'contexto/examples/top.sql', texto: '-- Q: top stores\nSELECT 1' });
    lista = (await get(`/api/workspaces/${w.id}/contexto`)).archivos;
    comprobar('un ejemplo nuevo aparece en la lista', lista.some(a => a.ruta === 'contexto/examples/top.sql' && a.existe));
    for (const ruta of ['../../config.json', 'contexto/../../x.md', 'C:/Windows/x.md', 'contexto/datos.csv']) {
        const r = await put(`/api/workspaces/${w.id}/contexto/archivo`, { ruta, texto: 'x' });
        comprobar(`no se escribe fuera de lo permitido: ${ruta}`, r.status === 400, JSON.stringify(r));
    }
    comprobar('y no apareció nada en el home', !fs.existsSync(path.join(HOME, 'config.json.x')) && !fs.existsSync(path.join(TMP, 'x.md')));

    console.log('\nsubir una métrica del proyecto al workspace');
    await post('/api/project/open', { path: P });
    const ofrecidas = (await get('/api/project/metricas')).metricas.map(m => m.name).sort().join();
    comprobar('el proyecto ofrece sus métricas', ofrecidas === 'margin,revenue', ofrecidas);
    const subida = await post(`/api/workspaces/${w.id}/contexto/subir-metrica`, { nombre: 'margin' });
    comprobar('se sube', subida.compartida === true, JSON.stringify(subida));
    const { parseMetrics } = require(path.join(RAIZ, 'server/ai/contextLoader.js'));
    const enWs = parseMetrics(fs.readFileSync(path.join(HOME, 'workspaces', w.id, 'contexto', 'metrics.yml'), 'utf8'));
    comprobar('y queda bien escrita en el metrics.yml del workspace', enWs.length === 1 && enWs[0].name === 'margin' && enWs[0].sql === 'SUM(total - cost)', JSON.stringify(enWs));
    comprobar('dos veces no', (await post(`/api/workspaces/${w.id}/contexto/subir-metrica`, { nombre: 'margin' })).status === 400);
    comprobar('la del proyecto sigue en el proyecto', /margin/.test(fs.readFileSync(path.join(P, 'context', 'metrics.yml'), 'utf8')));
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows suelta los archivos tarde */ }
console.log(`\n${pasadas} pasadas, ${fallos} fallos\n`);
process.exit(fallos ? 1 : 0);
