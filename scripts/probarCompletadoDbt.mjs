/**
 * El completado de dbt (5.12, fase 3b; I12, Dec-35), sin Monaco ni dbt.
 *
 *     node scripts/probarCompletadoDbt.mjs
 *
 * client/src/utils/dbtCompletado.js con un catálogo de ejemplo (y, al final, el
 * catálogo que arma el servidor desde un manifiesto y la base adjunta).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { contexto, sugerencias, aliasDeRefs, columnasTrasPunto, columnasDelModelo, diagnosticos, ayuda, sugerenciasYaml } from '../client/src/utils/dbtCompletado.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const labels = (xs) => xs.map(x => x.label);

const CAT = {
    disponible: true, proyecto: 'tienda', targets: ['prod', 'dev'],
    modelos: [
        { name: 'stg_ventas', materialized: 'view', description: 'Las ventas, limpias', path: 'models/staging/stg_ventas.sql', relation: '"tienda"."main"."stg_ventas"', columns: [{ name: 'id', type: 'INTEGER', description: 'El id' }, { name: 'tienda', type: 'VARCHAR', description: '' }, { name: 'importe', type: 'DOUBLE', description: '' }] },
        { name: 'fct_ventas', materialized: 'table', description: '', columns: [{ name: 'tienda', type: 'VARCHAR' }, { name: 'total', type: 'DOUBLE' }] },
        { name: 'int_nuevo', nuevo: true, columns: [] },
    ],
    seeds: [{ name: 'ventas', columns: [{ name: 'id' }, { name: 'tienda' }] }],
    snapshots: [{ name: 'ventas_snap', columns: [] }],
    fuentes: [{ name: 'crudo', path: 'models/staging/_fuentes.yml', tables: [{ name: 'pedidos', description: 'Los pedidos', columns: [{ name: 'pedido_id' }, { name: 'cliente' }] }] }],
    macros: [
        { name: 'redondear', package: 'tienda', propio: true, firma: 'redondear(columna, decimales=2)', description: 'Redondea', arguments: [{ name: 'columna', type: 'column', description: 'La columna' }] },
        { name: 'star', package: 'dbt_utils', propio: false, firma: 'star(from, relation_alias=False, except=[])', description: 'All columns', arguments: [] },
        { name: 'generate_surrogate_key', package: 'dbt_utils', propio: false, firma: 'generate_surrogate_key(field_list)', description: '', arguments: [] },
    ],
    vars: [{ name: 'tienda_principal', value: 'norte' }, { name: 'dias', value: 7 }],
};

console.log('\ndónde está el cursor');
comprobar('fuera de Jinja: sql', contexto('select * from x where ').tipo === 'sql');
comprobar("{{ ref(' → ref", contexto("select * from {{ ref('stg_").tipo === 'ref' && contexto("select * from {{ ref('stg_").prefijo === 'stg_');
comprobar("{{ source(' → fuente", contexto("from {{ source('cr").tipo === 'fuente');
comprobar("{{ source('crudo', ' → tabla de la fuente", contexto("from {{ source('crudo', 'pe").tipo === 'tablaDeFuente' && contexto("from {{ source('crudo', 'pe").fuente === 'crudo');
comprobar("{{ var(' → var", contexto("where tienda = '{{ var('ti").tipo === 'var');
comprobar('{{ target. → target', contexto('{{ target.').tipo === 'target');
comprobar('{{ this. → this', contexto('select max(x) from {{ this.').tipo === 'this');
comprobar('{{ config( → config', contexto('{{ config(\n    mat').tipo === 'config');
comprobar("config(materialized=' → valor de config", JSON.stringify(contexto("{{ config(materialized='ta")) === JSON.stringify({ tipo: 'valorDeConfig', clave: 'materialized', comilla: "'", prefijo: 'ta' }));
comprobar('{{ dbt_utils. → paquete', contexto('select {{ dbt_utils.st').tipo === 'paquete' && contexto('select {{ dbt_utils.st').paquete === 'dbt_utils');
comprobar('{{  → expresión; {%  → sentencia', contexto('select {{ ').tipo === 'expresion' && contexto('{% ').tipo === 'sentencia');
comprobar('tras cerrar }} vuelve a ser sql', contexto("select * from {{ ref('a') }} where ").tipo === 'sql');

console.log('\nlas sugerencias');
let s = sugerencias(contexto("from {{ ref('"), CAT);
comprobar('ref(): modelos, semillas y snapshots, y el nuevo que dbt aún no vio', ['stg_ventas', 'fct_ventas', 'int_nuevo', 'ventas', 'ventas_snap'].every(n => labels(s).includes(n)) && /not compiled yet/.test(s.find(x => x.label === 'int_nuevo').detail), JSON.stringify(labels(s)));
s = sugerencias(contexto("from {{ source('crudo', '"), CAT);
comprobar('las tablas de la fuente', JSON.stringify(labels(s)) === '["pedidos"]');
s = sugerencias(contexto("{{ var('"), CAT);
comprobar('las vars, con su valor por defecto', labels(s).join() === 'tienda_principal,dias' && /norte/.test(s[0].doc));
s = sugerencias(contexto('{{ target.'), CAT);
comprobar('target.: name, schema…, y los targets del proyecto', labels(s).includes('schema') && /prod, dev/.test(s.find(x => x.label === 'name').doc));
s = sugerencias(contexto('{{ config('), CAT);
comprobar('config(: las opciones, con sus valores', ['materialized', 'unique_key', 'incremental_strategy', 'on_schema_change', 'persist_docs'].every(n => labels(s).includes(n)) && /view,table,incremental,ephemeral/.test(s.find(x => x.label === 'materialized').insert));
s = sugerencias(contexto("{{ config(incremental_strategy='"), CAT);
comprobar('los valores de incremental_strategy, sin comillas de más', labels(s).join() === 'append,delete+insert,merge,microbatch' && s[0].insert === 'append');
s = sugerencias(contexto('{{ config(enabled='), CAT);
comprobar('enabled= sin comillas', s.find(x => x.label === 'false')?.insert === 'false');
s = sugerencias(contexto('select {{ dbt_utils.'), CAT);
comprobar('dbt_utils.: sus macros, con los argumentos obligatorios', labels(s).join() === 'star,generate_surrogate_key' && s[0].insert === 'star(${1:from})' && s[0].snippet, JSON.stringify(s[0]));
s = sugerencias(contexto('select {{ '), CAT);
comprobar('{{ : ref, source, config, is_incremental…, las macros propias y los paquetes', ['ref', 'source', 'config', 'is_incremental', 'redondear', 'dbt_utils'].every(n => labels(s).includes(n)) && s.find(x => x.label === 'dbt_utils').insert === 'dbt_utils.', JSON.stringify(labels(s)));
s = sugerencias(contexto('{% '), CAT);
comprobar('{% : if, for, set, macro, if is_incremental', ['if', 'for', 'set', 'macro', 'if is_incremental'].every(n => labels(s).includes(n)));
comprobar('sin catálogo, nada', sugerencias(contexto("{{ ref('"), null).length === 0);

console.log('\ncolumnas a través de ref() y source()');
const modeloSql = `with fuente as (select * from {{ source('crudo', 'pedidos') }}),\nfinal as (\n  select v.id, v. from {{ ref('stg_ventas') }} v\n  join {{ ref('fct_ventas') }} as f on f.tienda = v.tienda\n  where {{ ref('ventas') }}\n)\nselect * from final`;
const al = aliasDeRefs(modeloSql);
comprobar('los alias: v, f, y la CTE «fuente»', al.get('v')?.ref === 'stg_ventas' && al.get('f')?.ref === 'fct_ventas' && al.get('fuente')?.tabla === 'pedidos' && !al.has('where'), JSON.stringify([...al]));
let cols = columnasTrasPunto('  select v.id, v.', modeloSql, CAT);
comprobar('v. → las columnas de stg_ventas, con su tipo', labels(cols).join() === 'id,tienda,importe' && cols[0].detail === 'INTEGER (stg_ventas)');
cols = columnasTrasPunto('select fuente.', modeloSql, CAT);
comprobar('fuente. → las columnas de la fuente', labels(cols).join() === 'pedido_id,cliente');
comprobar('x. de algo que no es un alias → null (sigue el completado de siempre)', columnasTrasPunto('select otra.', modeloSql, CAT) === null);
cols = columnasDelModelo(modeloSql, CAT);
comprobar('todas las columnas que el modelo lee, sin repetir', labels(cols).join() === 'pedido_id,cliente,id,tienda,importe,total', JSON.stringify(labels(cols)));

console.log('\navisos');
let d = diagnosticos("select * from {{ ref('stg_ventsa') }}\njoin {{ ref('ventas') }}\njoin {{ source('crudo', 'pedido') }}\njoin {{ source('crud', 'x') }}\njoin {{ ref('otro_paquete', 'modelo') }}", CAT);
comprobar('un ref que no existe, con lo más parecido', d[0]?.mensaje === 'No model, seed or snapshot named «stg_ventsa» in this project. Did you mean «stg_ventas»?' && d[0].linea === 1 && d[0].desde === 23 && d[0].hasta === 33, JSON.stringify(d[0]));
comprobar('una tabla de fuente que no existe', d.some(x => /has no table «pedido».*«pedidos»/.test(x.mensaje)));
comprobar('una fuente que no existe', d.some(x => /No source named «crud».*«crudo»/.test(x.mensaje)));
comprobar('el ref a otro paquete y los que existen no avisan', d.length === 3, JSON.stringify(d.map(x => x.mensaje)));
comprobar('sin catálogo, sin avisos', diagnosticos("{{ ref('x') }}", null).length === 0);

console.log('\nal pasar el ratón');
let a = ayuda("select * from {{ ref('stg_ventas') }}", 25, CAT);
comprobar('un ref: materialización, descripción, relación y columnas', /\*\*stg_ventas\*\* · view/.test(a?.md) && /Las ventas, limpias/.test(a.md) && /`id` INTEGER — El id/.test(a.md), a?.md);
a = ayuda("from {{ source('crudo', 'pedidos') }}", 12, CAT);
comprobar('un source', /\*\*crudo.pedidos\*\* · source/.test(a?.md) && /Los pedidos/.test(a.md));
a = ayuda('select {{ dbt_utils.star(from=ref("x")) }}', 22, CAT);
comprobar('una macro de un paquete: su firma', /dbt_utils\.star\(from, relation_alias=False, except=\[\]\)/.test(a?.md || ''), a?.md);
a = ayuda("select {{ redondear('importe') }}", 12, CAT);
comprobar('una macro propia: firma y argumentos', /tienda\.redondear\(columna, decimales=2\)/.test(a?.md || '') && /`columna` \(column\): La columna/.test(a.md), a?.md);
comprobar('nada bajo el ratón → null', ayuda('select 1', 3, CAT) === null);

console.log('\nschema.yml');
let y = sugerenciasYaml('', CAT);
comprobar('arriba del todo: version, models, sources…', ['models', 'sources', 'seeds', 'snapshots'].every(n => labels(y).includes(n)));
y = sugerenciasYaml('models:\n  - name: ', CAT);
comprobar('- name: bajo models → los modelos', labels(y).includes('stg_ventas') && labels(y).includes('int_nuevo'), JSON.stringify(labels(y)));
y = sugerenciasYaml('models:\n  - name: stg_ventas\n    ', CAT);
comprobar('dentro de un modelo: description, columns, config…', ['description', 'columns', 'config', 'data_tests'].every(n => labels(y).includes(n)), JSON.stringify(labels(y)));
y = sugerenciasYaml('models:\n  - name: stg_ventas\n    columns:\n      - name: ', CAT);
comprobar('- name: bajo columns → las columnas de ESE modelo', labels(y).join() === 'id,tienda,importe', JSON.stringify(labels(y)));
y = sugerenciasYaml('models:\n  - name: fct_ventas\n    columns:\n      - name: total\n        ', CAT);
comprobar('dentro de una columna: description, data_tests…', ['description', 'data_tests', 'data_type'].every(n => labels(y).includes(n)), JSON.stringify(labels(y)));
y = sugerenciasYaml('models:\n  - name: stg_ventas\n    columns:\n      - name: id\n        data_tests:\n          - ', CAT);
comprobar('bajo data_tests → unique, not_null, accepted_values, relationships', labels(y).join() === 'unique,not_null,accepted_values,relationships', JSON.stringify(labels(y)));
y = sugerenciasYaml('sources:\n  - name: crudo\n    ', CAT);
comprobar('dentro de una fuente: tables, freshness…', ['tables', 'freshness', 'loaded_at_field'].every(n => labels(y).includes(n)), JSON.stringify(labels(y)));
y = sugerenciasYaml('models:\n  - name: stg_ventas\n    config:\n      materialized: ', CAT);
comprobar('materialized: → sus valores', labels(y).join() === 'view,table,incremental,ephemeral', JSON.stringify(labels(y)));

console.log('\nel catálogo del servidor');
{
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-catalogo-'));
    process.env.AMOXSQL_HOME = path.join(TMP, 'home');
    const require = createRequire(import.meta.url);
    const { catalogo, firmaDe } = require(path.join(RAIZ, 'server/dbt/catalogo.js'));
    comprobar('la firma de una macro desde su código', firmaDe('{%- macro star(from, relation_alias=False, except=[]) -%}\n...', 'star') === 'star(from, relation_alias=False, except=[])');
    const P = path.join(TMP, 'tienda');
    const esc = (rel, t) => { const f = path.join(P, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
    esc('dbt_project.yml', "name: tienda\nprofile: tienda\nvars:\n  dias: 7\n  tienda:\n    region: norte\n");
    esc('profiles.yml', 'tienda:\n  target: prod\n  outputs:\n    prod: { type: duckdb, path: tienda.duckdb }\n');
    esc('models/stg_ventas.sql', 'select 1');
    esc('models/nuevo.sql', 'select 1');
    esc('seeds/ventas.csv', 'a\n1\n');
    esc('target/manifest.json', JSON.stringify({
        nodes: {
            'model.tienda.stg_ventas': { name: 'stg_ventas', resource_type: 'model', schema: 'main', database: 'tienda', original_file_path: 'models/stg_ventas.sql', relation_name: '"tienda"."main"."stg_ventas"', config: { materialized: 'view' }, description: 'Las ventas', columns: { id: { name: 'id', description: 'El id' } } },
        },
        sources: { 'source.tienda.crudo.pedidos': { source_name: 'crudo', name: 'pedidos', original_file_path: 'models/f.yml', columns: {} } },
        macros: {
            'macro.tienda.m': { name: 'm', package_name: 'tienda', macro_sql: '{% macro m(a, b=1) %}{% endmacro %}', arguments: [] },
            'macro.dbt.run_query': { name: 'run_query', package_name: 'dbt', macro_sql: '' },
            'macro.dbt_duckdb.x': { name: 'x', package_name: 'dbt_duckdb', macro_sql: '' },
            'macro.dbt_utils.star': { name: 'star', package_name: 'dbt_utils', macro_sql: '{% macro star(from) %}{% endmacro %}', arguments: [{ name: 'from', type: 'relation' }] },
            'macro.dbt_utils.test_x': { name: 'test_x', package_name: 'dbt_utils', macro_sql: '' },
        },
    }));
    // La base del target, adjunta: las columnas reales.
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const { DuckDBInstance } = require(require.resolve('@duckdb/node-api', { paths: [RAIZ] }));
    const i = await DuckDBInstance.create(path.join(P, 'tienda.duckdb'));
    const c = await i.connect();
    await c.run("CREATE VIEW stg_ventas AS SELECT 1::INTEGER AS id, 'norte' AS tienda");
    c.closeSync(); i.closeSync();
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    await baseCentral.abrir().catch(() => {});
    await dbManager.connect('tienda.duckdb', P);
    const k = await catalogo(P, { dbManager });
    const stg = k.modelos.find(x => x.name === 'stg_ventas');
    comprobar('los modelos, y el nuevo por su archivo', k.disponible && stg && k.modelos.find(x => x.name === 'nuevo')?.nuevo === true && k.seeds.find(x => x.name === 'ventas')?.nuevo === true);
    comprobar('las columnas REALES de lo construido, con la descripción documentada', JSON.stringify(stg.columns) === JSON.stringify([{ name: 'id', type: 'INTEGER', description: 'El id' }, { name: 'tienda', type: 'VARCHAR', description: '' }]) && stg.construido, JSON.stringify(stg.columns));
    comprobar('sólo las macros del proyecto y sus paquetes (sin las de dbt, del adaptador ni test_)', k.macros.map(x => `${x.package}.${x.name}`).sort().join() === 'dbt_utils.star,tienda.m' && k.macros.find(x => x.name === 'm').firma === 'm(a, b=1)', JSON.stringify(k.macros.map(x => x.name)));
    comprobar('las vars (también las del proyecto) y los targets', k.vars.map(v => v.name).join() === 'dias,region' && k.targets.join() === 'prod');
    comprobar('las fuentes', k.fuentes[0]?.name === 'crudo' && k.fuentes[0].tables[0].name === 'pedidos');
    await dbManager.close().catch(() => {});
    await baseCentral.cerrar().catch(() => {});
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
