/**
 * El puente entre AmoxSQL y dbt (5.12, fase 6; I7, I6, Dec-31, Dec-32).
 *
 *     node scripts/probarDbtPuente.mjs
 *
 *   - las fuentes con nombre en `models/sources/amoxsql.yml`: env_var con la lectura,
 *     un valor por defecto que dice por qué falla fuera de AmoxSQL, formatter template,
 *     frescura por la fecha del archivo; buckets y lagos, no; lo puesto a mano se queda;
 *   - promover una consulta: ref() y source(), las CTE no, lo desconocido se marca, y
 *     la fuente usada se añade al YAML.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-dbtpuente-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });

const require = createRequire(import.meta.url);
const yaml = require(require.resolve('js-yaml', { paths: [RAIZ] }));
const puente = require(path.join(RAIZ, 'server/dbt/puente.js'));

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const lanza = (f) => { try { f(); return null; } catch (e) { return e; } };

const P = path.join(TMP, 'tienda');
const esc = (rel, t) => { const f = path.join(P, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof t === 'string' ? t : JSON.stringify(t)); };
esc('dbt_project.yml', "name: tienda\nprofile: tienda\nmodel-paths: ['models']\n");
esc('datos/ventas.csv', 'tienda,importe\nnorte,1\n');
esc('.amoxsql/fuentes/ventas-semanales.json', { nombre: 'ventas-semanales', tipo: 'archivo', ubicacion: 'datos/ventas.csv', descripcion: 'Las ventas de cada semana', frescuraDias: 7 });
esc('.amoxsql/fuentes/en-la-nube.json', { nombre: 'en-la-nube', tipo: 'bucket', ubicacion: 's3://cubo/x/', patron: '*.parquet' });
esc('target/manifest.json', {
    nodes: {
        'model.tienda.stg_ventas': { name: 'stg_ventas', resource_type: 'model', schema: 'main', database: 'tienda', alias: 'stg_ventas' },
        'model.tienda.fct': { name: 'fct', resource_type: 'model', schema: 'marts', database: 'tienda', alias: 'fct_ventas' },
        'seed.tienda.metas': { name: 'metas', resource_type: 'seed', schema: 'main', database: 'tienda' },
    },
    sources: {}, macros: {},
});

try {
    console.log('\nlas fuentes de AmoxSQL en dbt (I7)');
    let e = puente.estado(P);
    comprobar('lista las fuentes, cuáles sirven y su nombre en dbt', e.fuentes.length === 2 && e.fuentes.find(f => f.nombre === 'ventas-semanales')?.usable && e.fuentes.find(f => f.nombre === 'ventas-semanales').nombreEnDbt === 'ventas_semanales' && !e.fuentes.find(f => f.nombre === 'en-la-nube').usable && e.archivo === 'models/sources/amoxsql.yml', JSON.stringify(e));
    comprobar('un bucket no se puede (su credencial no viaja en una variable)', /cannot be used in dbt: en-la-nube/.test(lanza(() => puente.escribir(P, ['en-la-nube']))?.message || ''));
    e = puente.escribir(P, ['ventas-semanales']);
    const texto = fs.readFileSync(path.join(P, 'models/sources/amoxsql.yml'), 'utf8');
    const y = yaml.load(texto);
    const t = y.sources[0].tables[0];
    comprobar('escribe la source amoxsql, con su tabla', y.sources[0].name === 'amoxsql' && t.name === 'ventas_semanales' && t.meta.amoxsql_fuente === 'ventas-semanales' && t.description === 'Las ventas de cada semana' && e.fuentes.find(f => f.nombre === 'ventas-semanales').enDbt);
    comprobar('external_location por env_var, sin la ruta de esta máquina', t.config.external_location.startsWith("{{ env_var('AMOXSQL_FUENTE_VENTAS_SEMANALES', ") && !texto.includes('datos/ventas.csv') && !texto.includes(TMP.replace(/\\/g, '/')), t.config.external_location);
    comprobar('  con un valor por defecto que dice por qué falla fuera de AmoxSQL', /only available when dbt runs from AmoxSQL/.test(t.config.external_location));
    comprobar('  formatter template (las llaves del SQL no rompen nada)', t.config.formatter === 'template');
    comprobar('la frescura por la fecha del archivo, con los días de la fuente', /read_blob\('\{\{ env_var\('AMOXSQL_FUENTE_VENTAS_SEMANALES_ARCHIVO', ''\) \}\}'\)/.test(t.config.loaded_at_query) && t.config.freshness.warn_after.count === 7, JSON.stringify(t.config));
    comprobar('una cabecera dice que la ubicación no está aquí', texto.startsWith('# Written by AmoxSQL'));
    // Algo puesto a mano en la misma source se respeta.
    y.sources[0].tables.push({ name: 'a_mano', description: 'puesta por el ingeniero' });
    fs.writeFileSync(path.join(P, 'models/sources/amoxsql.yml'), yaml.dump(y));
    puente.escribir(P, []);
    const y2 = yaml.load(fs.readFileSync(path.join(P, 'models/sources/amoxsql.yml'), 'utf8'));
    comprobar('quitar las de AmoxSQL respeta lo puesto a mano', y2.sources[0].tables.map(x => x.name).join() === 'a_mano', JSON.stringify(y2));

    console.log('\npromover una consulta (I6)');
    const sql = `with base as (select * from stg_ventas)\nselect b.*, f.total, m.meta\nfrom base b\njoin "marts"."fct_ventas" f on f.tienda = b.tienda\nleft join user_db.main.metas m on m.tienda = b.tienda\njoin fuentes."ventas-semanales" v on v.tienda = b.tienda\njoin tabla_misteriosa x on true\ncross join read_csv('otra.csv')`;
    const c = puente.convertir(P, sql);
    comprobar('un modelo → ref()', c.texto.includes("select * from {{ ref('stg_ventas') }}"), c.texto);
    comprobar('por su alias y su esquema → ref() con su nombre', c.texto.includes("join {{ ref('fct') }} f"));
    comprobar('user_db.esquema.tabla de una semilla → ref()', c.texto.includes("left join {{ ref('metas') }} m"));
    comprobar('fuentes."x" → source(\'amoxsql\', …)', c.texto.includes("join {{ source('amoxsql', 'ventas_semanales') }} v") && c.fuentesNuevas.join() === 'ventas-semanales');
    comprobar('una CTE y una función de lectura no se tocan', c.texto.includes('from base b') && c.texto.includes("read_csv('otra.csv')"));
    comprobar('lo que no se sabe de dónde sale, a dudas', JSON.stringify(c.dudas) === '["tabla_misteriosa"]', JSON.stringify(c.dudas));
    const p = puente.promover(P, { sql: `${sql};`, nombre: 'Ventas con Metas', capa: 'marts', origen: 'analisis.sql' });
    const modelo = fs.readFileSync(path.join(P, p.archivo), 'utf8');
    comprobar('escribe models/<capa>/<nombre>.sql', p.archivo === 'models/marts/ventas_con_metas.sql' && modelo.startsWith('-- Promoted from «analisis.sql» on '), p.archivo);
    comprobar('  con la duda marcada y sin el «;» final', /-- AmoxSQL: I do not know where «tabla_misteriosa» comes from/.test(modelo) && !/;\s*$/.test(modelo));
    comprobar('  y la fuente que usa queda en el YAML', yaml.load(fs.readFileSync(path.join(P, 'models/sources/amoxsql.yml'), 'utf8')).sources[0].tables.some(x => x.meta?.amoxsql_fuente === 'ventas-semanales'));
    comprobar('no pisa un modelo que ya existe', /already exists/.test(lanza(() => puente.promover(P, { sql: 'select 1', nombre: 'ventas_con_metas' }))?.message || ''));
    comprobar('sin nombre o sin consulta, lo dice', !!lanza(() => puente.promover(P, { sql: 'select 1', nombre: '' })) && !!lanza(() => puente.promover(P, { sql: ' ', nombre: 'x' })));

    console.log('\npor el servidor');
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const u = (q) => `http://localhost:${port}${q}`;
    const pedir = (m) => (q, b) => fetch(u(q), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
    await pedir('POST')('/api/project/open', { path: P });
    let h = await pedir('GET')('/api/dbt/fuentes');
    comprobar('GET /api/dbt/fuentes', h.fuentes?.length === 2);
    h = await pedir('PUT')('/api/dbt/fuentes', { nombres: ['en-la-nube'] });
    comprobar('PUT con un bucket: 400', h.status === 400);
    h = await pedir('POST')('/api/dbt/promover', { sql: 'select * from stg_ventas', nombre: 'otro', capa: 'staging' });
    comprobar('POST /api/dbt/promover', h.archivo === 'models/staging/otro.sql' && h.cambios.length === 1, JSON.stringify(h));
    h = await pedir('GET')(`/api/dbt/modelo?archivo=${encodeURIComponent('analisis/suelto.sql')}`);
    comprobar('un .sql suelto en un proyecto dbt: se puede promover', h.esDbt === false && h.proyectoDbt === true, JSON.stringify(h));
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
